# Technology Stack — RealtyWyze Phase 2–6

**Project:** RealtyWyze (v2.0 milestone on existing DealerWyze platform)
**Researched:** 2026-05-28
**Base stack:** Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui, Supabase, Vercel, Resend, Stripe, Twilio, Remotion Lambda 4.0.455, Anthropic SDK 0.78, Playwright 1.58

---

## Phase 1: Listing Intelligence

### MLS Data — Property Lookup and Comparables

**Recommendation: RentCast API (primary) + Bridge Interactive (secondary fallback)**

**RentCast** (formerly Realty Mole, migrated to developers.rentcast.io)
- Free tier: 50 requests/month (dev/testing)
- Foundation: $74/month for 1,000 requests
- Growth: $199/month for 5,000 requests
- Endpoints that matter: `GET /properties` (property details), `GET /avm/sale` (value estimate + comps), `GET /avm/rent`, `GET /listings` (active for-sale), `GET /markets/{zipCode}` (aggregate market data)
- REST/JSON, clean docs at developers.rentcast.io — easy to integrate
- Provides CMA-quality output: AVM range, comp list with addresses, prices, DOM
- Confidence: HIGH (verified at rentcast.io/api and developers.rentcast.io)

**ATTOM Data** (owns Estated — they are merging)
- Starts at $95/month, enterprise pricing above that
- Broader coverage (158M properties, deed/mortgage data, demographics)
- Do NOT use Estated directly — their API is being deprecated in 2026 as it migrates to ATTOM infrastructure
- Use ATTOM only if RentCast coverage gaps appear for specific markets
- Confidence: MEDIUM (WebSearch + attomdata.com pricing page)

**Bridge Interactive** (bridgedataoutput.com)
- Bridge itself charges nothing — fees are between you and the MLS
- Requires a data agreement with each participating MLS
- Only viable if specific agents/brokers have their MLS on Bridge and you have a data agreement
- Not suitable as a general data source for an SaaS product without enterprise MLS agreements
- Confidence: HIGH (verified via Bridge docs and developer portal)

**What NOT to use:**
- Estated direct API — being deprecated 2026, do not build new integrations against it
- RealtyAPI — insufficient coverage data found, LOW confidence in reliability
- RESO Web API / Spark API — require MLS board membership and data agreements; not viable for multi-tenant SaaS without that pipeline

**Decision for Phase 1:** Use RentCast Foundation tier ($74/month). Gate MLS# lookup on RentCast property search. Use Claude Vision (already wired via `vehicles/intake/scan-image`) for photo scanning — no new library needed.

### URL Scraping (Zillow / Redfin listing import)

**Recommendation: Apify platform with their Zillow actor, or Scrapfly for sustained production use**

DIY scraping with Playwright (already installed at v1.58) will fail on Zillow within days due to Imperva WAF. You need residential proxies + fingerprint management, which is not worth operating internally.

**Apify** (apify.com)
- Managed platform; pay-per-result on their Zillow actors
- Zillow scraper: ~$1.30/1k results (search) to $3/1k (property details)
- For a feature where agents import one listing at a time, cost is negligible (~$0.003/import)
- Free tier: $5/month in credits — covers dev/testing
- Integration: call Apify REST API from a Next.js API route; receive webhook or poll for result
- Confidence: MEDIUM-HIGH (verified at apify.com/pricing and use-apify.com benchmark data)

**Scrapfly** (scrapfly.io)
- 96% success rate on Zillow, 18s latency — slower but high reliability
- Better for production if you need higher volumes
- ~$850/1k requests (high-volume) — overkill at typical agent usage rates

**ScraperAPI**
- ~98% success, 6.1s latency, $810/1k requests
- Most expensive but highest success rate; justified only at scale

**Decision:** Start with Apify. At 1–5 imports per agent per day, costs are trivial. Install the `apify-client` npm package (`npm install apify-client`). Point to the `automation-lab/zillow-scraper` or `maxcopell/zillow-scraper` actor. If Redfin is needed, use a separate Apify actor — Redfin has similar anti-bot measures.

**What NOT to use:**
- Raw Playwright/Cheerio against Zillow/Redfin — fails immediately without residential proxies
- ScraperAPI at launch — expensive for low-volume use; revisit if volume justifies it

### Photo Scanning (CMA photos, listing images)

Use existing Claude Vision pipeline (`/api/vehicles/intake/scan-image` pattern). No new library. Adapt prompt for real estate context: extract address, beds/baths/sqft, features, condition notes from listing photos.

### CMA Generation

Use Claude (Anthropic SDK already installed) with RentCast comp data as context. No separate CMA service needed. Pattern: fetch comps from RentCast → pass to Claude with prompt → return structured CMA summary. Store output in `transactions` or a new `cma_reports` table.

### Performance Tracking

Pure Supabase — store showing counts, DOM (days on market), price changes in the `vehicles` table (already extended with RE columns in migration 179). No external service.

---

## Phase 2: Transactions, Showings & Commissions

### Database Tables

Already created in migrations 179 (`listing_columns`) and 180 (`re_tables`): `showings`, `transactions`, `commission_plans`. Use these. Migration numbering starts at 189 for new Phase 2+ migrations.

### Commission Calculations

Pure TypeScript — no library. Commission splits are straightforward math. Implement in a `lib/realty/commission.ts` utility. Store split results in `transactions` table.

### Closing Timeline

Supabase + TypeScript. Use `date-fns` (verify it is not already in package.json — it is not, but `zod` date parsing covers validation). Add `date-fns` if you need business day calculations: `npm install date-fns`. Otherwise stick to native `Date` operations.

### Remotion RE Listing Video

**Recommendation: Add a new Composition to `remotion/Root.tsx` — no new deployment needed**

Remotion is already at v4.0.455. The architecture (Root.tsx registers all Compositions) is exactly designed for adding new templates. Steps:
1. Create `remotion/REListingShowcase/index.tsx` with a new composition for RE listing video (property photos, address, price, beds/baths/sqft, agent branding)
2. Import and register in `remotion/Root.tsx` with a new `<Composition id="REListingShowcase" ... />`
3. Redeploy the Remotion site bundle: `npx remotion lambda sites create remotion/index.ts --site-name=my-video` (overwrites existing site, same site name)
4. The same Lambda function renders all templates — no new Lambda deploy needed

Props shape for RE: `{ address, price, beds, baths, sqft, photos: string[], agentName, agentPhoto, brokerageName, logoUrl }`

Confidence: HIGH (verified via Remotion Lambda docs — one function, multiple compositions by design)

---

## Phase 3: AI Voice — Retell RE Agent

**Recommendation: Create a second Retell agent in the same account with a distinct `agent_id`**

Retell supports multiple agents per account. Each agent has its own system prompt, voice, knowledge base, and `agent_id`. No account separation needed.

Steps:
1. In Retell dashboard, create new agent ("Alex from RealtyWyze" or similar RE persona)
2. Note the new `agent_id`
3. Add env var: `RETELL_RE_AGENT_ID=agent_xxx`
4. In your Retell webhook/call-creation code, select agent ID based on `org.vertical === 'real_estate'`
5. System prompt: focus on property inquiries, showing scheduling, buyer qualification — distinct from dealer agent which handles vehicle leads

**Prompt strategy:** Single-prompt agent is appropriate for RE receptionist use case (open-ended qualification, showing booking). Multi-prompt is overkill for v1 RE agent.

No new npm packages needed — existing Retell SDK/REST calls already in codebase. Add `RETELL_RE_AGENT_ID` to env vars and update Retell call-creation logic to be vertical-aware.

Confidence: HIGH (verified via Retell docs at docs.retellai.com and community posts confirming multiple agents per account)

---

## Phase 4: Public Listing Site ([slug].realtywyze.us)

### Wildcard Subdomain Routing

**Recommendation: Next.js middleware subdomain rewrite — no additional library needed**

Vercel supports unlimited `*.yourdomain.com` subdomains with automatic SSL on all paid plans (Pro+). The Vercel for Platforms docs (last updated 2025-12-18) confirm this.

Pattern:
1. In Vercel dashboard: add `*.realtywyze.us` as a wildcard domain on the project
2. DNS: add wildcard CNAME `*.realtywyze.us → cname.vercel-dns.com` at registrar
3. In `middleware.ts`: read `request.headers.get('host')`, extract subdomain, rewrite to `/listing-site/[slug]/*`
4. Create `app/listing-site/[slug]/page.tsx` and `app/listing-site/[slug]/[...path]/page.tsx`
5. Gate: only serve if `org.vertical === 'real_estate'` and `org.listing_site_slug === slug`

Local dev note: wildcard subdomains do not work on `localhost`. Use `lvh.me` (routes to 127.0.0.1) or hardcode a test slug via env var.

No new packages. Existing middleware pattern in the codebase handles similar rewriting for admin vertical scoping.

### SEO

Use Next.js App Router's native `generateMetadata()` — no additional library. Generate `<title>`, `<meta description>`, Open Graph tags from listing data. For sitemap: `app/listing-site/[slug]/sitemap.ts` using Next.js `MetadataRoute.Sitemap`.

### Inquiry Form

Reuse existing lead-intake patterns. Public form POSTs to `/api/public/listing-inquiry` (new route). Creates a `customers` record + `activities` record scoped to the org. Rate-limit with Upstash (already installed).

---

## Phase 5: Integrations

### DocuSign eSignature

**Recommendation: DocuSign eSignature API — start with free developer sandbox, upgrade to Starter ($50/month) for production**

- npm package: `npm install docusign-esign` (official Node.js SDK, GitHub: docusign/docusign-esign-node-client)
- Auth: OAuth 2.0 Authorization Code flow — each RE org connects their own DocuSign account
- Store per-org `access_token`, `refresh_token`, `account_id` in `org_settings` or a new `integrations` table
- Key operations: create envelope (upload PDF → add recipients → send), get envelope status, download signed document
- Webhooks (DocuSign Connect): real-time status updates — available on Starter plan and above
- Free dev sandbox: unlimited testing, documents not legally valid (sufficient for building + testing)

**Complexity warning:** DocuSign OAuth per-org (each agency connects their own account) adds auth management overhead. Per-org tokens require refresh logic. Store tokens encrypted (use Supabase with column-level encryption or a secrets pattern). Plan for token expiry handling in background jobs.

**What NOT to use:**
- Dotloop API — less mature developer tooling, no official Node SDK, real-estate-specific but worse API extensibility. Only relevant if your target agencies are already Dotloop shops. Defer unless agents specifically request it.
- Building your own e-signature — never worth it for a SaaS product

### Scheduling (Showing Appointments)

**Recommendation: Cal.com embed (`@calcom/embed-react`) for agent-side booking pages**

Cal.com offers three embed styles for React/Next.js (`@calcom/embed-react`). The API covers full booking lifecycle (slot retrieval, booking creation, rescheduling, cancellation) — unlike Calendly whose API does not support creating bookings.

- npm: `npm install @calcom/embed-react`
- Each agent connects their Cal.com account (or you provision via Cal.com Platform API)
- Buyers access a public booking widget embedded on the listing page or via link
- Booking confirmation triggers a webhook → create `showings` record in Supabase

**Cal.com vs Calendly:**
- Cal.com: open source, API supports full booking creation, better for custom flows, React embed is first-class
- Calendly: better brand recognition with buyers, but API cannot programmatically create bookings — you can only embed their hosted UI
- For a CRM where you need to write showing records on booking, Cal.com's API is necessary

**Alternative:** Build a native showing scheduler using existing `showings` table (already in migration 180). Agents share a link → buyer picks time → creates `showings` record. Avoids third-party dependency entirely. This is the right v1 approach — add Cal.com integration as a Phase 5+ enhancement.

**Decision:** Ship Phase 2 showings with a native simple scheduler. Add Cal.com embed as an integration in Phase 5.

### QuickBooks Online Export

**Recommendation: Official Intuit OAuth 2.0 + QuickBooks Online Accounting API**

- npm: `npm install node-quickbooks` (mcohen01/node-quickbooks — community wrapper; or call Intuit REST API directly)
- Auth: OAuth 2.0 per-org — each agency connects their QuickBooks account
- Use case: export commission transactions as income records to QuickBooks
- Key endpoints: `POST /v3/company/{realmId}/invoice` or `POST /v3/company/{realmId}/payment`
- Rate limits: 500 req/minute per company

**Complexity warning:** Same per-org OAuth management pattern as DocuSign. Access tokens expire every hour; refresh tokens rotate every 24–26 hours with max 5-year lifetime. You must store and rotate the latest refresh token on every use. Implement in a `lib/integrations/quickbooks.ts` module with a token-refresh wrapper.

**Scope:** For v1, scope this to CSV export only (no live QuickBooks sync). A simple CSV download of commission records (from `transactions` table) covers 80% of the accounting use case with 5% of the integration complexity. Build the CSV export first; add live QuickBooks sync as a follow-on.

### Webhooks (Outbound)

Use existing pattern from dealer vertical. Implement in `lib/realty/webhooks.ts`. Events to emit: `listing.created`, `listing.updated`, `showing.scheduled`, `showing.completed`, `transaction.closed`, `commission.calculated`. Store webhook endpoints per-org in `org_settings` or a new `webhook_subscriptions` table (migration 189+).

No new packages — use native `fetch` with HMAC-SHA256 signature (already implemented for other webhooks in codebase).

---

## Packages to Install (Net New)

```bash
# Phase 1 — Listing Intelligence
npm install apify-client          # Zillow/Redfin URL scraping

# Phase 2 — Transactions / Video
npm install date-fns              # Only if business-day date math needed; defer if not

# Phase 4 — Public Listing Site
# No new packages — middleware pattern only

# Phase 5 — Integrations
npm install docusign-esign        # E-signature API
npm install @calcom/embed-react   # Showing scheduler embed (Phase 5, not Phase 2)
# QuickBooks: use node-quickbooks OR raw fetch — decide at implementation time
```

Total new packages: 2–4. All other phases use existing installed libraries.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| MLS/property data | RentCast | ATTOM direct | ATTOM is pricier, Estated deprecated; RentCast has better DX for single-property AVM |
| Property data | RentCast | Bridge Interactive | Bridge requires per-MLS agreements; not viable for multi-tenant SaaS |
| URL scraping | Apify | DIY Playwright | Zillow blocks datacenter IPs; managing residential proxies not worth operational cost |
| URL scraping | Apify | ScraperAPI | ScraperAPI is 2.6x more expensive at comparable volume |
| CMA | RentCast + Claude | Separate CMA service | No need; RentCast provides comp data, Claude synthesizes narrative |
| E-signature | DocuSign | Dotloop | Dotloop has no official Node SDK; DocuSign has broader adoption and mature API |
| Scheduler | Native (Phase 2) + Cal.com (Phase 5) | Calendly | Calendly API cannot create bookings programmatically |
| Accounting | CSV export first, then QBO | QuickBooks live sync at launch | OAuth per-org is high complexity; CSV covers most cases with near-zero effort |
| RE video | New Composition in existing Remotion | New Remotion project | Same Lambda function handles all compositions — no new deployment needed |
| Retell RE agent | Second agent_id, same account | Separate Retell account | Retell explicitly supports multiple agents per account; no account separation needed |

---

## Environment Variables (New)

```bash
# Phase 1
RENTCAST_API_KEY=               # From developers.rentcast.io
APIFY_API_TOKEN=                # From apify.com (for URL scraping)

# Phase 3
RETELL_RE_AGENT_ID=             # Second Retell agent for RE vertical

# Phase 4
# No new env vars — wildcard routing is DNS + Vercel config only
# NEXT_PUBLIC_APP_URL_REALTY already planned in REALTYWYZE_TODO.md

# Phase 5
DOCUSIGN_CLIENT_ID=             # From DocuSign developer portal
DOCUSIGN_CLIENT_SECRET=         # From DocuSign developer portal
DOCUSIGN_REDIRECT_URI=          # https://realtywyze.us/api/integrations/docusign/callback
CALCOM_CLIENT_ID=               # From Cal.com platform (if using Platform API)
CALCOM_CLIENT_SECRET=
# QuickBooks:
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REDIRECT_URI=
```

---

## Confidence Assessment

| Area | Confidence | Source |
|------|------------|--------|
| RentCast pricing and endpoints | HIGH | Verified at rentcast.io/api and developers.rentcast.io |
| Bridge Interactive model (MLS agreements) | HIGH | Verified at bridgedataoutput.com docs |
| Estated deprecation status | MEDIUM | WebSearch (multiple sources agree) |
| Apify Zillow scraper pricing | MEDIUM | Verified at apify.com/pricing and use-apify.com benchmarks |
| Zillow anti-bot posture (requires paid scraper) | HIGH | Benchmark article on dev.to (2026), multiple sources |
| Remotion multi-composition single Lambda | HIGH | Verified via remotion.dev/docs/lambda |
| Retell multiple agents per account | HIGH | Verified via docs.retellai.com |
| Vercel wildcard subdomain (all paid plans) | HIGH | Verified via vercel.com/docs/multi-tenant (updated 2025-12-18) |
| DocuSign pricing tiers | HIGH | Verified at ecom.docusign.com/plans-and-pricing/developer |
| Cal.com API books appointments (Calendly cannot) | MEDIUM | WebSearch + Cal.com docs; test before committing |
| QuickBooks token rotation behavior | HIGH | Multiple developer guides agree; confirmed at getknit.dev |
| ATTOM starts at $95/month | MEDIUM | WebSearch (attomdata.com pricing page not directly fetched) |

---

## Sources

- [RentCast API pricing](https://www.rentcast.io/api)
- [RentCast developer docs](https://developers.rentcast.io/reference/introduction)
- [Bridge Interactive developer docs](https://bridgedataoutput.com/docs/platform/Introduction/Signing-up-with-Bridge-API)
- [ATTOM Data API](https://www.attomdata.com/solutions/property-data-api/)
- [Estated deprecation / ATTOM acquisition](https://estated.com/developers/docs/v4)
- [Zillow scraping benchmark 2026](https://dev.to/agenthustler/zillow-scraping-in-2026-anti-bot-defenses-api-alternatives-and-benchmark-results-17ll)
- [Apify pricing](https://apify.com/pricing)
- [Apify Zillow scrapers](https://apify.com/automation-lab/zillow-scraper)
- [Remotion Lambda multi-composition](https://www.remotion.dev/docs/lambda)
- [Retell AI multiple agents / prompt overview](https://docs.retellai.com/build/single-multi-prompt/prompt-overview)
- [Vercel for Platforms — wildcard subdomains](https://vercel.com/docs/multi-tenant)
- [DocuSign plans and pricing](https://ecom.docusign.com/plans-and-pricing/developer)
- [DocuSign Node.js SDK](https://github.com/docusign/docusign-esign-node-client)
- [Cal.com embed quickstart](https://cal.com/docs/platform/quickstart)
- [QuickBooks Online API guide](https://www.getknit.dev/blog/quickbooks-online-api-integration-guide-in-depth)
