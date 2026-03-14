# DealerWyze Growth Architecture Plan
**Prepared: 2026-03-10 | Horizon: 6–18 months out | Status: Planning only — no immediate implementation**

---

## Context

DealerWyze is a CRM-first SaaS platform for independent used-car dealers. The business has a working multi-tenant foundation, Stripe billing, voice AI, SMS, and a solid data model. Revenue is live.

The next strategic question: **how do we build a defensible moat that makes DealerWyze irreplaceable — not just a better CRM, but the operating system independent dealers cannot leave?**

The answer is vertical integration across three pillars: dealer websites, wholesale inventory exchange, and a consumer auto marketplace. This is exactly what Cox Automotive built into a $20B+ empire. Cars.com is executing the same playbook for franchises. The independent dealer segment ($42,000 US dealers, ~$75M/yr in website spend alone) is structurally underserved — Cox and Cars.com don't serve this market well because their pricing starts at $750-$1,650/mo and is franchise-first.

**DealerWyze can own the independent dealer stack** from the bottom up before incumbents pay attention.

---

## Competitive Landscape Summary

### Pillar 1: Dealer Websites

| Provider | Price/mo | Segment | Pain Points |
|---|---|---|---|
| CarsForsale.com | $99-$199 | Independent | No CRM integration; leads arrive by email; weak SEO; VIN scan 20% success rate |
| Overfuel | $399-$800 | Independent/Mid | Best Core Web Vitals; no CRM |
| DealerOn | $1,000-$2,000 | Franchise | Core Web Vitals failures; breaks monthly after updates |
| DealerInspire (Cars.com) | $1,650+ | Franchise | OEM co-op locked; rigid CMS |
| Dealer.com (Cox) | $1,650-$3,000 | Franchise | Same |

**Market gap**: Independent dealers at $99/mo get a template + a directory listing + email leads. They get nothing CRM-connected.

### Pillar 2: Wholesale Marketplace

| Platform | Fee/vehicle | Pain Points for Independents |
|---|---|---|
| Manheim (Cox) | $600-$700+ | Physical auctions; franchise-favored; huge fee |
| OPENLANE/ADESA | $366 (raised 16% in 2025) | Fees rising; captive off-lease not accessible to independents |
| ACV Auctions | $150-$360 | Growing; condition reports still inaccurate |

Auction share of dealer inventory sourcing dropped from 27% (2019) to 18% (2024). Dealers losing confidence. Independent dealers can't access OEM captive pools.

**The DealerWyze Model is Different from All of These**

This is NOT an auction. This is a **live peer-to-peer dealer network** built around a specific use case:

> "Dealer A has a customer who wants a specific car. Dealer A doesn't have it. They search the network, find Dealer B nearby has it — frontline ready, photos visible, sell price known. Dealer A makes the deal for their customer."

This gives every small dealer unlimited virtual inventory. They don't carry the floor plan risk. They don't over-stock. They just find the right car for the customer they already have. Every dealer on the DealerWyze network becomes a potential inventory source for every other dealer.

Requirements for listing on the wholesale network:
- Vehicle must be published (photos, specs, price)
- Vehicle must be marked "frontline ready" (clean title, inspected, lot-ready)
- Selling dealer sets their dealer-to-dealer price (separate from retail price)
- No blind auctions — buying dealer sees everything before agreeing to terms

This model does NOT require:
- A real-time bidding engine (peer-to-peer offers)
- Auction floor software
- Condition report disputes (photos + frontline-ready flag handle this)
- Escrow holding (dealers pay dealers directly, like a normal wholesale trade)

### Pillar 3: Consumer Marketplace

| Platform | Revenue | Avg dealer cost |
|---|---|---|
| CarGurus | $894M | $29,000/dealer/year ($7,337/quarter) |
| Cars.com | $719M | $3,600-$18,000/year |
| AutoTrader | Private | $5,400-$24,000/year |

A typical 50-car independent lot in a competitive market pays **$1,500-$5,000/month across 2-3 portals**. DealerWyze dealers are already paying this to competitors.

**The DealerWyze Value Proposition**

The consumer marketplace is a direct CarGurus/CarFax/AutoTrader replacement. The dealer's CRM subscription ($150-$350/mo) includes consumer-facing inventory listings. The $29,000/year they're paying CarGurus disappears. This is the clearest ROI story in the platform — dealers understand this immediately.

**Branding Note**: Unified brand (DealerWyze) for both B2B (dealers) and B2C (consumers). The consumer side inherits trust from the dealer-verified data: response times, deal ratings, price history. One brand, two audiences.

---

## The Defensible Flywheel

```
CRM tenants (inventory + leads + CRM data)
        |
        v
Dealer Websites (VDPs indexed by Google per dealer)
        |
        v
Google indexes thousands of VDPs organically
        |
        v
Consumers find dealer inventory via search
        |
        v
Web leads route to CRM inbox in <10 seconds
        |
        v
Dealers see measurable ROI from DealerWyze platform
        |
        v
More dealers join → more inventory indexed
        |
        v
Aging vehicles flow to wholesale marketplace
        |
        v
Dealers source inventory from the same platform
        |
[LOCK-IN COMPLETE: switching costs across all 4 layers]
```

**Each layer creates a distinct switching cost:**
- CRM: customer history, deal records, templates (12-18 months to migrate)
- Website: Google has indexed VDP URLs for dealer's inventory history. Changing providers = 410s + lost ranking equity
- Consumer marketplace: dealer reviews and verified response time badges live here
- Wholesale: buyer/seller reputation and transaction history non-portable

---

## Build Order (Critical — Don't Skip This)

### Phase 1 — Foundation (Months 1-4, build inside the CRM)
Build the infrastructure that powers all three pillars. Nothing launches publicly. No consumer marketing spend.

**Goal**: Every CRM dealer has a latent public VDP page that just needs to be turned on.

### Phase 2 — Dealer Websites + Consumer Marketplace (Months 4-9)
These launch together — not sequentially. Every dealer who activates their website gets:
- A public-facing inventory page at `their-slug.dealerwyze.com`
- Their vehicles aggregated under `dealerwyze.com/cars` immediately
- $0 setup fee, $99/mo add-on

The consumer marketplace is the natural extension of dealer websites. They're the same technology — the only difference is the aggregation layer on top. Build once, serve both.

**The ROI pitch to dealers**: "Stop paying CarGurus $2,000/month. Your DealerWyze subscription includes a website AND a consumer marketplace listing. Same leads. Same exposure. Already included."

**Goal**: Build the inventory corpus (10,000+ indexed VDPs). Prove ROI by showing dealers the leads and organic traffic they're getting.

### Phase 3 — Wholesale Dealer Network (Months 12-18)
The peer-to-peer live inventory network. Builds naturally from the fact that all dealers are already on DealerWyze and their inventory is already public.

- Dealer marks vehicle as "Available wholesale" with dealer-to-dealer price
- Any DealerWyze dealer can search nearby wholesale inventory by radius, make, model, price
- Dealer sends offer → seller accepts/counters → deal terms agreed → both dealers handle title/transport directly
- DealerWyze charges a flat facilitation fee per completed transaction ($75-$125)

**Why this works NOW**: Dealers already know each other locally. The network trust exists. DealerWyze is just providing the discovery layer and paper trail.

**Why not earlier**: Needs a critical mass of dealers in each market to have useful local inventory density. Phase 2 builds that density.

---

## Critical Architecture Decisions to Make NOW (Phase 1)

These are low-cost, high-leverage changes to make inside the CRM before any public launch. Getting these wrong early means painful migrations later.

### 1. Commit to the VDP URL Structure (do this first — hard to change once indexed)

```
Dealer website VDP:     /inventory/[year]-[make]-[model]-[trim]-[stock-no]/
Consumer marketplace:   /cars/[state]/[city]/[make]/[model]/
Consumer VDP:           /cars/[dealer-slug]/[stock-no]/
```

- `[stock-no]` makes URLs unique per dealer without exposing VIN
- `-[trim]` differentiates same make/model at same dealer
- Structure is human-readable, keyword-rich for SEO, and works for both dealer site and consumer marketplace

### 2. Vehicle Schema Additions (migration needed)

Add to `vehicles` table:
```sql
published              boolean DEFAULT false  -- controls whether VDP is public
public_slug            text                   -- year-make-model-stock-no (auto-generated)
price_history          jsonb DEFAULT '[]'     -- [{price, changed_at}] for consumer trust display
views_count            integer DEFAULT 0      -- VDP view counter
condition_report_json  jsonb                  -- structured condition (for future wholesale)
wholesale_eligible     boolean DEFAULT false  -- opt-in to dealer-to-dealer listing
```

### 3. Organization Schema Addition

Add to `organizations` table:
```sql
custom_domain          text UNIQUE           -- dealer's own domain (CNAME to Vercel)
public_inventory_enabled  boolean DEFAULT false
website_tagline        text                  -- used on dealer's website header
```

### 4. Multi-Tenant Domain Routing (extends existing proxy.ts)

- Vercel wildcard subdomain: `*.dealerwyze.com` already supported
- Add: read `host` header in proxy.ts → lookup org by `slug` (column exists, migration 035) or `custom_domain`
- Vercel Domains API: programmatic custom domain addition when dealer activates website
- Result: `apollo-auto.dealerwyze.com` and `apolloautosa.com` both serve Apollo's inventory

### 5. Unauthenticated Lead Capture

New table: `inventory_inquiries`
```sql
id, org_id, vehicle_id, name, email, phone, message, source_url, created_at
```

New API route: `POST /api/leads/web` (no auth required)
- Validates org_id + vehicle_id are real
- Writes to `inventory_inquiries` AND creates an activity (type='web_lead', direction='inbound')
- Triggers dealer SMS notification via existing Twilio stack
- Honeypot + rate limiting (no CAPTCHA to start)

### 6. SEO Infrastructure (per dealer website)

- Sitemap: `GET /[slug]/sitemap.xml` → generated from `vehicles WHERE org_id = X AND published = true AND status != 'sold'`
- Sold vehicles: return `410 Gone` immediately (de-indexes from Google quickly)
- JSON-LD Vehicle schema on every VDP (structured data for Google rich results)
- OG tags: `og:title`, `og:description`, `og:image` per vehicle
- Auto-generated local SEO category pages: `/[slug]/inventory/[make]/`, `/[slug]/inventory/[make]/[model]/`

### 7. Consumer Auth (completely separate from dealer auth)

- Do NOT mix with dealer auth or platform admin auth
- Supabase separate project or new auth role: `consumer`
- Scope: saved vehicles, saved searches, price drop email alerts
- MVP: no auth required for VDP browsing or lead submission. Auth only for saved searches.

---

## What to Reuse from Current Codebase

| Existing Asset | How It's Reused |
|---|---|
| `organizations.slug` (migration 035) | Sub/custom domain routing key |
| FTS indexes on `vehicles` (migration 001) | Search results pages — no Algolia needed for MVP |
| `lib/sms/quota.ts` notification pattern | Trigger dealer SMS on web lead |
| `app/api/leads/ingest/route.ts` + `lib/leads/` | Adapt for unauthenticated web lead submission |
| Deprecated feed endpoints (`/api/inventory/cargurus-feed/[slug]`) | URL pattern already has `[slug]` — reuse routing approach |
| `components/layout/DesktopSidebar.tsx` admin detection | Website toggle in org settings |
| `StorageWidget.tsx` | Vehicle photo storage management (extend for public photos) |
| `proxy.ts` PUBLIC_PATHS | Add `/inventory/`, `/cars/`, `/[slug]/` paths |

---

## Revenue Projections

| Milestone | Dealers | MRR | ARR |
|---|---|---|---|
| Today | ~5-20 | ~$3K-$7K est. | ~$36K-$84K |
| Phase 2 launch (50% website attach) | 200 | ~$42K | $504K |
| Phase 2 maturity | 500 | ~$120K | $1.44M |
| Phase 3 wholesale live + sponsored listings | 1,000 | $350K+ | $4.2M+ |

Website add-on alone: $99/mo x 1,000 dealers = $99K MRR / $1.2M ARR incremental on top of CRM.

**The dealer cost savings story (sales pitch math)**:
- CarGurus: $2,000/mo
- AutoTrader: $1,200/mo
- CarsForsale website: $149/mo
- Total today: ~$3,349/mo

- DealerWyze CRM + Voice: $350/mo
- DealerWyze website + consumer marketplace: $99/mo
- Total with DealerWyze: ~$449/mo

**Dealer saves ~$2,900/month. That's the pitch. That's how you grow.**

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| OEM co-op certification locks franchise dealers out | Low — targeting independents only | Non-issue; independents receive no co-op subsidy. Advantage: no certification bureaucracy. |
| Consumer marketplace chicken-and-egg | Medium | Solve with SEO, not paid CAC. Build inventory corpus first; let Google bring consumers. |
| Wholesale: title transfer law varies by state | High complexity | Launch CA + TX + FL only. Engage automotive transactional attorney before launch. |
| Wholesale: money transmitter licensing for escrow | High — if holding funds | Structure as "connected offer platform" — dealer pays dealer directly. No fund holding. |
| Cox/AutoTrader competitive response at 500+ dealers | Medium | Defense is switching cost depth. SEO history + wholesale reputation + lead attribution are non-portable. |
| Vehicle photo storage capacity | Low | Existing storage infrastructure + Stripe storage add-ons handle this |

---

## Files to Modify in Phase 1

| File / Location | Change |
|---|---|
| `supabase/migrations/063_public_vdp.sql` (new) | `published`, `public_slug`, `price_history`, `views_count`, `condition_report_json`, `wholesale_eligible` on vehicles; `custom_domain`, `public_inventory_enabled`, `website_tagline` on organizations |
| `supabase/migrations/064_inventory_inquiries.sql` (new) | `inventory_inquiries` table |
| `proxy.ts` | Add `/inventory/`, `/[slug]/`, `/cars/` to PUBLIC_PREFIXES; add host header → org slug lookup |
| `app/[slug]/inventory/page.tsx` (new) | Dealer inventory list page (public, ISR) |
| `app/[slug]/inventory/[vdp-slug]/page.tsx` (new) | Public VDP page with JSON-LD, OG tags, lead form |
| `app/[slug]/sitemap.xml/route.ts` (new) | Per-dealer sitemap generation |
| `app/api/leads/web/route.ts` (new) | Unauthenticated lead capture endpoint |
| `app/(app)/vehicles/[id]/page.tsx` | Add "Publish to website" toggle (writes `published` flag) |
| `app/(app)/settings/website/page.tsx` (new) | Dealer website settings: tagline, custom domain, toggle |
| `organizations` migration | Add `custom_domain`, `public_inventory_enabled`, `website_tagline` |

---

## Verification (when Phase 1 is built)

1. Visit `apollo-auto.dealerwyze.com/inventory/` — should show Apollo's published vehicles without login
2. Click a VDP — check page source for `<script type="application/ld+json">` (Vehicle schema)
3. Submit lead form — confirm activity appears in Apollo CRM inbox + dealer gets SMS notification
4. Check `/api/inventory/apollo-auto/sitemap.xml` returns valid XML with VDP URLs
5. Mark a vehicle as sold in CRM — confirm VDP returns 410 Gone within 1 hour (ISR revalidation)
6. Test custom domain: point a test domain CNAME to Vercel, add to org — confirm it resolves to correct dealer inventory

---

## Summary: What to Build Into the CRM NOW (Before Revenue Milestone)

These 6 decisions cost ~3-4 sprints now and save 6 months of painful migration later:

1. **Commit to VDP URL structure** — affects all future SEO equity
2. **Add `published` + `public_slug` to vehicles** — enables website launch without schema change
3. **Add `custom_domain` to organizations** — enables custom domain without schema change
4. **Build unauthenticated lead capture** — the connective tissue between website and CRM
5. **Build multi-tenant host routing in proxy.ts** — the technical foundation for all three pillars
6. **Vehicle photo storage bucket** — needed for any public-facing VDPs to look credible

**Do not build**: auction engine, consumer auth, consumer saved searches, wholesale offers, or review system yet. These are Phase 2-4 work.
