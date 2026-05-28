# Phase 7: Listing Intelligence - Research

**Researched:** 2026-05-28
**Domain:** RE listing import — Apify scraping, RentCast API, Claude Vision, vehicles table dual-use
**Confidence:** HIGH (codebase verified) / MEDIUM (external APIs verified via official docs)

---

## Summary

Phase 7 builds AI-assisted listing import and market intelligence on top of the existing `vehicles` table dual-use pattern established in migrations 179–180. The foundation is already solid: the `vehicles` table has all RE-specific columns (address, bedrooms, bathrooms, sqft, mls_number, property_type, etc.), the PATCH route accepts all RE fields, and `POST /api/vehicles` already handles RE listings with vertical detection.

The three import paths (URL scrape, photo scan, MLS# lookup) all have close analogs in the existing dealer intake flow. The primary work is adapting those patterns with RE-specific prompts/field mappings, adding two external API integrations (Apify, RentCast), and building the listing detail UI features (performance metrics, CMA display).

**Primary recommendation:** Reuse `scan-image` and `parse-text` patterns with RE-specific prompts. For URL import, call Apify synchronously via `apify-client` npm package on the server side. For MLS# + CMA, call RentCast's `/v1/avm/value` endpoint with address (not MLS# directly — RentCast does not support MLS# as a primary lookup parameter; use address derived from the listing).

---

## Standard Stack

### Core (all already installed/configured)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@anthropic-ai/sdk` | current | Claude Vision for photo scan (LIST-02) | Already used in scan-image route |
| `apify-client` | npm | Call Apify actors for URL scraping (LIST-01) | NOT YET installed — needs `npm install apify-client` |
| `zod` | current | Input validation at API boundaries | Already used throughout |
| Supabase `createClient()` | current | DB writes to vehicles table | Already used |

### External APIs
| Service | Auth | Purpose | Pricing |
|---------|------|---------|---------|
| Apify | `APIFY_API_TOKEN` header or client init | Zillow/Redfin URL scraping | ~$1.70/1000 results (pay-per-use) |
| RentCast | `X-Api-Key` header | MLS area data + CMA/AVM | $74/mo plan (already decided) |

### Apify Actor Selection (MEDIUM confidence — verified on Apify platform)

**For Zillow single-property URLs:**
- Actor: `maxcopell/zillow-detail-scraper`
- Actor ID: `ENK9p4RZHg0iVso52`
- Input: `{ startUrls: [{ url: "https://www.zillow.com/homedetails/..." }], propertyStatus: "FOR_SALE" }`
- Output: address, price, zestimate, bedrooms, bathrooms, living area (sqft), lot size, year built, property type, days on Zillow, HOA, agent/broker info, photo URLs, coordinates
- Cost: $1.70/1,000 results (~$0.002 per listing import)

**For Redfin single-property URLs:**
- Actor: `ecomscrape/redfin-com-property-details-page-scraper`
- Actor ID slug: `ecomscrape~redfin-com-property-details-page-scraper`
- Input: `{ urls: ["https://www.redfin.com/..."] }`
- Output: price, address, features, coordinates (full schema requires verification at runtime)
- Cost: $15/mo subscription + usage

**For Realtor.com URLs:**
- No verified single-property actor with strong track record found. Recommend fallback to Claude Vision on the URL approach (paste page text rather than structured scrape) for Realtor.com.

### RentCast API Endpoints (MEDIUM confidence — verified via official docs)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `https://api.rentcast.io/v1/avm/value` | GET | Property AVM + comparable sales (CMA) |
| `https://api.rentcast.io/v1/markets` | GET | Market statistics by zip code |
| `https://api.rentcast.io/v1/properties` | GET | Property record lookup by address |
| `https://api.rentcast.io/v1/listings/sale` | GET | Active sale listings search |

**Auth:** All requests require `X-Api-Key: {RENTCAST_API_KEY}` header.

**Rate limit:** 20 requests/second.

**Key parameters for CMA (`/v1/avm/value`):**
- Required: `address` (full address "Street, City, State, Zip") OR `latitude`+`longitude`
- Optional: `propertyType`, `bedrooms`, `bathrooms`, `squareFootage`, `compCount` (5–25, default 15), `daysOld`, `maxRadius`
- Returns: AVM estimate + array of comparable properties with sale prices and dates

**Key parameters for market stats (`/v1/markets`):**
- Required: `zipCode` (5-digit)
- Optional: `dataType` (All/Sale/Rental), `historyRange` (months, default 12)
- Returns: median price, price/sqft, days on market, new listings count, breakdown by property type

**MLS# lookup reality check:** RentCast returns `mlsNumber` as a field in listing results, but does NOT support MLS# as a primary lookup key. To look up by MLS#, use `/v1/listings/sale` and filter results, or have the agent enter the address when doing the CMA.

**Installation:**
```bash
npm install apify-client
```

Add to `.env.example`:
```
APIFY_API_TOKEN=apify_api_...       # Apify account token for Zillow/Redfin scraping
RENTCAST_API_KEY=your-rentcast-key  # RentCast property data API
```

Add to `lib/env/validate.ts` OPTIONAL array (both degrade gracefully when unset).

---

## Architecture Patterns

### Existing Files to Adapt (do not hand-roll from scratch)

| New Route | Adapt From | Change |
|-----------|------------|--------|
| `app/api/listings/import-url/route.ts` | `app/api/vehicles/intake/parse-text/route.ts` | Replace Claude text parse with Apify actor call; add vertical guard |
| `app/api/listings/scan-photo/route.ts` | `app/api/vehicles/intake/scan-image/route.ts` | Replace vehicle prompt with RE listing prompt; same image validation |
| `app/api/listings/import-mls/route.ts` | `app/api/vehicles/[id]/market-check/route.ts` | Call RentCast instead of MarketCheck; address-based lookup |
| `app/api/listings/[id]/cma/route.ts` | `app/api/vehicles/[id]/market-check/route.ts` | Call RentCast `/v1/avm/value`; cache result in `market_data_json` |
| `app/api/listings/[id]/metrics/route.ts` | `app/api/vehicles/[id]/view/route.ts` | Return DOM + showing count from `showings` table |

### Recommended Project Structure
```
app/api/listings/
├── import-url/route.ts       # LIST-01: Apify scraper
├── scan-photo/route.ts       # LIST-02: Claude Vision
├── import-mls/route.ts       # LIST-03: RentCast property lookup
├── [id]/
│   ├── cma/route.ts          # LIST-05: RentCast AVM + comps
│   └── metrics/route.ts      # LIST-04: DOM + showing stats
lib/listings/
├── apifyScrape.ts            # Apify actor call + field mapping
├── rentcast.ts               # RentCast API wrapper
└── parseListingPhoto.ts      # Claude Vision prompt for RE
```

UI is in `app/(app)/vehicles/` — the listing detail and new listing pages already exist. Extend them with vertical-conditional import buttons rather than building new pages.

### Pattern 1: Apify Actor Call (Synchronous Run)
**What:** Call Apify actor, wait for result using `apify-client`'s `call()` which blocks until actor finishes (default timeout 120s).
**When to use:** LIST-01 URL import.

```typescript
// Source: apify-client npm package docs
import { ApifyClient } from 'apify-client'

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN })

export async function scrapeZillowUrl(url: string) {
  const run = await client.actor('ENK9p4RZHg0iVso52').call({
    startUrls: [{ url }],
    propertyStatus: 'FOR_SALE',
  })
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  return items[0] ?? null
}
```

**Field mapping from Zillow output to vehicles columns:**
```
zpid (or url)          → listing_url
address                → address_line1, city, state, zip
price                  → price
bedrooms               → bedrooms
bathrooms              → bathrooms
livingArea             → sqft
lotSize                → lot_size
yearBuilt              → year_built
homeType               → property_type
daysOnZillow           → (store in market_data_json)
hoaMonthly             → hoa_monthly
photos[0].url          → photo_url (first photo)
agentName              → (not stored in vehicles; log only)
```

### Pattern 2: Claude Vision for RE Listing Photo (LIST-02)
Adapt `scan-image/route.ts` — same base64 image + mimeType validation, different prompt:

```typescript
// Prompt to replace vehicle prompt in scan-image route:
const RE_SCAN_PROMPT = `Extract real estate listing information from this image or flyer.
Return ONLY valid JSON with these exact keys (use null if not found):
{
  "address": string|null,
  "city": string|null,
  "state": string|null,
  "zip": string|null,
  "price": number|null,
  "bedrooms": number|null,
  "bathrooms": number|null,
  "sqft": number|null,
  "year_built": number|null,
  "property_type": string|null,
  "mls_number": string|null,
  "listing_agent": string|null
}
Do not include any text outside the JSON object.`
```

Route must guard: `if (org.vertical !== 'real_estate') return 403`.

### Pattern 3: Prefill Form Flow (LIST-01, LIST-02, LIST-03)
All three import paths use the same prefill pattern the dealer intake already uses:
1. Client POSTs to import API route
2. Route returns extracted field object
3. Client merges extracted fields into form state
4. Agent reviews/corrects, then saves (POST to `/api/vehicles`)

For URL import specifically, the client-side flow:
```
[Agent pastes Zillow URL]
  → POST /api/listings/import-url { url }
  → Server calls Apify actor (synchronous, ~5-15s)
  → Returns { address, price, bedrooms, ... }
  → Client prefills new-listing form
  → Agent reviews → Save creates vehicles row
```

Use `maxDuration = 60` on the import-url route (Apify can take up to 30s).

### Pattern 4: RentCast CMA (LIST-05)
```typescript
// lib/listings/rentcast.ts
export async function fetchCMA(address: string, zip: string, opts: {
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  propertyType?: string
}) {
  const params = new URLSearchParams({
    address,
    compCount: '15',
    ...(opts.bedrooms ? { bedrooms: String(opts.bedrooms) } : {}),
    ...(opts.sqft ? { squareFootage: String(opts.sqft) } : {}),
  })
  const res = await fetch(`https://api.rentcast.io/v1/avm/value?${params}`, {
    headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY! },
  })
  if (!res.ok) throw new Error(`RentCast error: ${res.status}`)
  return res.json()
  // Returns: { price, priceRangeLow, priceRangeHigh, comparables: [...] }
}
```

Cache CMA result in `market_data_json` on the vehicles row with a TTL (suggest 7 days for RE, same as dealer market check).

### Anti-Patterns to Avoid
- **Calling Apify from the browser:** never expose `APIFY_API_TOKEN` to the client. All Apify calls are server-side only.
- **Storing MLS# as the primary vehicles row identifier:** `stock_no` must still be set; use `mls_number` column for the MLS# (migration 179 already added it).
- **Using `year: 0, make: 'RE'` as query filters:** these are placeholder values for NOT NULL constraints. Never filter by them. Always filter RE listings by `address_line1 IS NOT NULL` or by vertical.
- **Running Apify with `maxDuration < 60`:** actor runs take 10–30s; set `export const maxDuration = 60` on import routes.
- **Passing `org_id` in the request body to vehicles insert:** derive from `requireProfile()` as `profile.org_id`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zillow/Redfin HTML parsing | Custom fetch + cheerio scraper | Apify actors | ToS/CFAA; anti-bot blocks; actor already handles pagination, retries, proxy rotation |
| AVM/comparable sales | Manual comp search logic | RentCast `/v1/avm/value` | 140M property records; already handles radius search, comp scoring |
| Market statistics by zip | Aggregate query on external data | RentCast `/v1/markets` | Historical trends, DOM stats, price/sqft — all precomputed |
| Image field extraction | Regex parsing of OCR text | Claude Vision (same pattern as dealer) | Handles varied flyer layouts, photos, text overlays |
| Realtor.com HTML parsing | Custom scraper | Fallback to paste-text → Claude (same as dealer parse-text) | Realtor.com anti-scraping is aggressive; no proven Apify actor |

**Key insight:** The Zillow/Redfin scraping problem is already solved by Apify. The AVM/CMA problem is already solved by RentCast. This phase is plumbing — connecting those services to the existing form and table patterns.

---

## Common Pitfalls

### Pitfall 1: vehicles table NOT NULL constraints for RE rows
**What goes wrong:** `year`, `make`, `model`, `stock_no` are NOT NULL in the original schema. RE listings don't have these.
**Why it happens:** Schema was designed for cars.
**How to avoid:** The existing `POST /api/vehicles` RE path already handles this correctly: `year: 0, make: 'RE', model: address.slice(0, 100)`. Replicate this pattern in any new insert path. Do NOT change the schema constraint.
**Warning signs:** Insert errors mentioning "null value in column year" or "not-null constraint violated."

### Pitfall 2: Apify actor run timeout
**What goes wrong:** Apify actor takes longer than Next.js function timeout, returning a gateway error.
**Why it happens:** Zillow detail scraper can take 15–40s for a cold actor start.
**How to avoid:** Set `export const maxDuration = 60` on the import-url route. Add a 45s client-side timeout with a clear "import is taking longer than usual" message.
**Warning signs:** 504 errors on the import route.

### Pitfall 3: RentCast address format sensitivity
**What goes wrong:** CMA returns empty or wrong comparables because address format doesn't match RentCast's expectations.
**Why it happens:** RentCast requires "Street, City, State, Zip" format. Partial addresses fail.
**How to avoid:** Construct the full address string server-side from `address_line1 + ', ' + city + ', ' + state + ' ' + zip`. Validate that all four components are present before calling RentCast. Return a `422` with a user-facing message if address is incomplete.

### Pitfall 4: Dealer smoke-test gate on vehicles migrations
**What goes wrong:** Migration 189+ alters `vehicles` table, breaks dealer intake or existing queries.
**Why it happens:** `vehicles` is shared between dealer and RE verticals.
**How to avoid:** All new columns must use `ADD COLUMN IF NOT EXISTS` with nullable defaults. No new NOT NULL constraints without defaults. No changes to existing check constraints. After migration, verify dealer `/vehicles/new` page still works with VIN decode + save flow.

### Pitfall 5: MLS# lookup misconception
**What goes wrong:** Building an MLS# → property data lookup by sending MLS# as a query param to RentCast.
**Why it happens:** RentCast returns `mlsNumber` in response data, which implies it's searchable.
**How to avoid:** RentCast does not accept `mlsNumber` as a search filter. LIST-03 flow should: (a) ask agent to confirm the property address alongside MLS#, (b) call RentCast by address, (c) verify the returned `mlsNumber` matches. Alternatively: store the MLS# in `mls_number` and call RentCast for AVM/area data only.

### Pitfall 6: Apify response is an array
**What goes wrong:** Code treats `items[0]` as guaranteed, crashes on empty import (listing removed, URL 404'd).
**Why it happens:** Zillow detail scraper returns empty dataset if listing is not found or URL format is wrong.
**How to avoid:** Always check `if (!items.length)` and return a 404/422 with "Listing not found at that URL — it may have been removed or the URL is incorrect."

---

## Code Examples

### URL Import Route Skeleton
```typescript
// app/api/listings/import-url/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { scrapeListingUrl } from '@/lib/listings/apifyScrape'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  // Vertical guard — RE only
  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations').select('vertical').eq('id', profile.org_id).single()
  if (org?.vertical !== 'real_estate') {
    return NextResponse.json({ error: 'Not available for this account' }, { status: 403 })
  }

  const { url } = await req.json().catch(() => ({}))
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // Validate URL is from supported domain
  const allowed = ['zillow.com', 'redfin.com']
  const isAllowed = allowed.some(d => url.includes(d))
  if (!isAllowed) {
    return NextResponse.json({
      error: 'Paste a Zillow or Redfin listing URL. Realtor.com imports use the text paste method.',
    }, { status: 400 })
  }

  const extracted = await scrapeListingUrl(url)
  if (!extracted) {
    return NextResponse.json({ error: 'Listing not found at that URL' }, { status: 422 })
  }

  return NextResponse.json(extracted)
}
```

### RentCast CMA Route Skeleton
```typescript
// app/api/listings/[id]/cma/route.ts
export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: listing } = await supabase
    .from('vehicles')
    .select('address_line1, city, state, zip, bedrooms, bathrooms, sqft, property_type, market_data_json, market_checked_at')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Return cached if fresh (7 days)
  if (listing.market_checked_at) {
    const ageHours = (Date.now() - new Date(listing.market_checked_at).getTime()) / 3_600_000
    if (ageHours < 168 && listing.market_data_json) {
      return NextResponse.json({ data: listing.market_data_json, cached: true })
    }
  }

  // Build full address
  const { address_line1, city, state, zip } = listing
  if (!address_line1 || !city || !state || !zip) {
    return NextResponse.json({ error: 'Complete the property address before running a CMA' }, { status: 422 })
  }
  const address = `${address_line1}, ${city}, ${state} ${zip}`

  const cmaData = await fetchCMA(address, { ... })

  await supabase.from('vehicles').update({
    market_data_json: cmaData,
    market_checked_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ data: cmaData, cached: false })
}
```

---

## Migration Plan (189, 190, 191)

### Migration 189: Listing import tracking columns
Adds columns needed to track import source and performance metrics.
**Dealer smoke-test gate required on all changes.**

```sql
-- 189_listing_import_tracking.sql
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS import_source      TEXT,           -- 'manual','url_scrape','photo_scan','mls_import'
  ADD COLUMN IF NOT EXISTS import_url         TEXT,           -- source URL if imported via Apify
  ADD COLUMN IF NOT EXISTS import_raw_json    JSONB,          -- raw Apify/RentCast payload for debugging
  ADD COLUMN IF NOT EXISTS showing_count      INTEGER DEFAULT 0,  -- denormalized from showings table
  ADD COLUMN IF NOT EXISTS price_change_count INTEGER DEFAULT 0,  -- number of price reductions
  ADD COLUMN IF NOT EXISTS price_change_log   JSONB;          -- [{from, to, changed_at}]

-- Index for listing performance queries
CREATE INDEX IF NOT EXISTS idx_vehicles_import_source
  ON vehicles(import_source) WHERE import_source IS NOT NULL;
```

### Migration 190: Listing status extension
Extends vehicles status check constraint to include RE-specific statuses.

```sql
-- 190_listing_status_re.sql
-- Current constraint: status IN ('available','pending','sold','staging','sync_removed')
-- RE needs: 'active','contingent','closed','withdrawn','expired'
ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_status_check;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_status_check
  CHECK (status IN (
    'available','pending','sold','staging','sync_removed',  -- dealer
    'active','contingent','closed','withdrawn','expired'    -- RE
  ));
```

**WARNING:** This modifies a check constraint on a live table. Must verify no existing dealer rows have values outside the original set before deploying. Dealers continue using the original 5 values; RE uses the new 5. The `POST /api/vehicles` route already defaults to `'available'` for both verticals — no change needed there.

### Migration 191: Listing performance trigger
Denormalizes showing count to vehicles for fast dashboard queries.

```sql
-- 191_listing_showing_count_trigger.sql
-- Keep showing_count on vehicles in sync with showings table inserts/deletes
CREATE OR REPLACE FUNCTION sync_listing_showing_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE vehicles SET showing_count = COALESCE(showing_count, 0) + 1
    WHERE id = NEW.listing_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE vehicles SET showing_count = GREATEST(COALESCE(showing_count, 0) - 1, 0)
    WHERE id = OLD.listing_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_showing_count ON showings;
CREATE TRIGGER trg_listing_showing_count
  AFTER INSERT OR DELETE ON showings
  FOR EACH ROW EXECUTE FUNCTION sync_listing_showing_count();
```

---

## vehicles Table: Current Columns vs RE Needs

### Existing columns (from migrations 001–188)
**Core (both verticals):** `id`, `user_id` (org_id), `stock_no`, `vin`, `year`, `make`, `model`, `trim`, `color`, `mileage`, `price`, `status`, `notes`, `photo_url`, `created_at`

**Dealer extensions:** `sold_price`, `sold_at`, `sold_to_customer_id`, `finance_type`, `finance_company`, `listing_url`, `voice_summary`, `market_data_json`, `market_checked_at`, `ai_description`, `nhtsa_recall_count`, `reliability_tier`

**RE extensions (migration 179):** `property_type`, `bedrooms`, `bathrooms`, `sqft`, `lot_size`, `year_built`, `address_line1`, `city`, `state`, `zip`, `school_district`, `subdivision`, `mls_number`, `parcel_id`, `listing_type`, `expiration_date`, `showing_instructions`, `idx_source`, `idx_external_id`, `idx_synced_at`, `seller_contact_id`, `listing_agent_id`, `commission_pct`, `co_broke_pct`, `hoa_monthly`

### What Phase 7 needs to add (migrations 189–191)
`import_source`, `import_url`, `import_raw_json`, `showing_count`, `price_change_count`, `price_change_log` — all new columns, all nullable, no impact on dealer rows.

### Dual-use gotchas
- `year: 0, make: 'RE', model: address` — placeholder values for RE rows to satisfy NOT NULL constraints. Never display or filter on these in the RE UI.
- `stock_no` — auto-generated (`ONB-{timestamp}`) for RE listings. Not shown to agents; use `mls_number` instead.
- `listing_url` — already exists (migration 018). For RE, this is the Zillow/Redfin URL used for import. Use it; don't create a duplicate column.
- `market_data_json` / `market_checked_at` — reused for CMA cache. Same 7-day TTL pattern as dealer market check.
- RLS policy: `vehicles` uses `user_id = auth.uid()` where `user_id` stores `org_id`. This is unchanged; RE listings scope correctly via the same policy.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| VIN decode as primary identifier | address as primary identifier for RE | `address_line1` is the canonical field; `vin` is null on RE rows |
| parse-text → Claude for car pages | Apify actor → structured scrape for RE | More reliable field extraction; no LLM needed for URL import |
| MarketCheck API for dealer pricing | RentCast API for RE AVM | Different endpoint, same cache pattern in `market_data_json` |

---

## Open Questions

1. **Realtor.com import strategy**
   - What we know: Apify has no proven single-property Realtor.com actor with high reliability.
   - What's unclear: Whether to support it at all, or route agents to the paste-text fallback.
   - Recommendation: Scope LIST-01 to Zillow + Redfin only. Display a message for Realtor.com: "Copy and paste the listing description text to import via AI text scan." This uses the existing parse-text pattern with an RE prompt.

2. **Apify actor reliability**
   - What we know: `maxcopell/zillow-detail-scraper` (ID: `ENK9p4RZHg0iVso52`) has 4.9 stars, 6,000+ users, $1.70/1000.
   - What's unclear: Actor may fail if Zillow changes its layout. Apify actors by third parties can be abandoned.
   - Recommendation: Wrap Apify call with a try/catch that surfaces "Import unavailable, try pasting the listing description" as a graceful fallback. Log the raw error.

3. **RentCast MLS# lookup**
   - What we know: RentCast does not accept MLS# as a search parameter. Returns it in responses.
   - What's unclear: If agents expect "enter MLS#, get all property data automatically."
   - Recommendation: LIST-03 flow = agent enters MLS# + confirms address → system stores MLS# in `mls_number` column → optionally triggers RentCast lookup by address for AVM. Set expectation clearly in UI: "Enter the MLS# and the property address to look up market data."

4. **Price change tracking**
   - What we know: `price_change_log` column planned in migration 189.
   - What's unclear: Whether to track price changes via a DB trigger on vehicles or via the PATCH route.
   - Recommendation: Track in the PATCH route — when `price` field changes, append to `price_change_log` JSONB and increment `price_change_count`. Simpler than a trigger, easier to debug.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `app/api/vehicles/intake/scan-image/route.ts` — exact pattern for LIST-02
- Codebase: `app/api/vehicles/intake/parse-text/route.ts` — exact pattern for LIST-01 fallback
- Codebase: `app/api/vehicles/route.ts` — RE vertical detection + insert pattern
- Codebase: `app/api/vehicles/[id]/route.ts` — EDITABLE_FIELDS list including all RE fields
- Codebase: `supabase/migrations/179_listing_columns.sql` — full list of existing RE columns
- Codebase: `supabase/migrations/180_re_tables.sql` — showings/transactions/commission_plans tables
- Codebase: `lib/vertical/realEstate.ts` — feature flags including `mlsSync: true`
- Codebase: `lib/billing/assertFeature.ts` — `ai_scan` billing gate pattern to replicate

### Secondary (MEDIUM confidence — verified via official Apify platform pages)
- https://apify.com/maxcopell/zillow-detail-scraper — Actor ID `ENK9p4RZHg0iVso52`, input/output schema
- https://apify.com/ecomscrape/redfin-com-property-details-page-scraper — Redfin single-property actor
- https://developers.rentcast.io/reference/value-estimate — CMA endpoint (`GET /v1/avm/value`)
- https://developers.rentcast.io/reference/market-statistics — Market stats endpoint (`GET /v1/markets`)
- https://developers.rentcast.io/llms.txt — Full endpoint index

### Tertiary (LOW confidence — not verified against live API)
- RentCast `/v1/listings/sale` endpoint for MLS# area search — referenced in docs index, not fully verified
- Realtor.com Apify actor availability — search results show no strong candidate; treat as unsupported

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing packages verified in codebase; apify-client is standard npm
- Architecture patterns: HIGH — direct adaptation of verified codebase patterns
- Apify actor IDs: MEDIUM — verified on Apify platform pages; third-party actors can change
- RentCast endpoints: MEDIUM — verified via official developer docs and changelog
- Migration plan: HIGH — follows existing additive migration pattern; no destructive changes
- MLS# via RentCast: MEDIUM — confirmed limitation via docs; MLS# is output-only field

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (Apify actor IDs: re-verify before implementation; RentCast: stable)
