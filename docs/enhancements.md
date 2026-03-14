# DealerWyze — Enhancement Backlog

Strategic ideas captured here. Promote to ROADMAP.md when ready to schedule.

---

## Consumer-Side Growth (Marketplace / Pillar 1+3)

### SEO Strategy
- Every published VDP = an indexed page on dealerwyze.com. At 500 dealers x 50 cars = 25,000 SEO pages at launch.
- Need: intentional metadata, JSON-LD schema (done), sitemap per dealer (done), internal linking between vehicles, fast page load.
- Add: auto-generated "Used [Make] for sale in [City]" meta descriptions per VDP.
- Add: a `dealerwyze.com/cars` index page aggregating all published inventory for SEO.

### Consumer Trust Signals
- Verified dealer reviews (only buyers who transacted can post — not Google, internal).
- "X vehicles sold through DealerWyze" badge on dealer public page.
- Vehicle history report link (Carfax affiliate = revenue share, ~$3-5/click).
- Days on lot counter (creates urgency for consumers).

### Trade-In Estimator
- Widget on VDP: Year, Make, Model, Mileage, Condition → estimated range.
- Phase 1: Lead capture only (consumer enters info, dealer gets notified with trade-in details).
- Phase 2: Real-time valuations via MarketCheck API (~$200/mo) or Kelley Blue Book API.
- Revenue: dealer closes more deals; potential referral from lenders.

### Consumer Pre-Qualification
- "See what you're pre-qualified for — no impact to your credit score" button on VDP.
- Soft pull credit via Prism Data or similar.
- Dealer receives lead with "Pre-qualified up to $X" — closes deals faster.
- Partners to evaluate: Prism Data, RouteOne, DealerSocket credit tools.

---

## Dealer-Side Growth (CRM / Pillar 1+2)

### Vehicle Staging & Reconditioning (BUILT - 2026-03-11)
- Pre-sale workflow for purchased cars not yet ready for the lot.
- Reconditioning checklist (Detail, Oil, Brakes, Tires, Smog, etc.) with per-item cost + notes + completion tracking.
- Investment rollup: Purchase Price + Recon Costs + Ledger Expenses = Total Investment + Est. Profit vs list price.
- Document attachments (receipts, smog cert, invoices) via existing vehicle doc system.
- Receipt scanning expenses assignable to staging vehicles.
- "Mark Ready" promotes vehicle to available; required checklist items gate the promotion.
- Org-level customizable checklist template in Settings.
- **Pending:** Context-aware scanner fix (Lead screen = lead, Inventory = vehicle, Staging = staging vehicle).

### Share Vehicle via Text (BUILT - 2026-03-10)
- One-tap button on vehicle detail page sends VDP link to a customer via SMS.
- Only shows when vehicle is published and has a public_slug.
- Pre-filled message: "Check out this [vehicle]: [URL]"

### Dealer Analytics for Public Pages (BUILT - 2026-03-10)
- Views per vehicle, total views, inquiry count.
- Top vehicles by views.
- Shows on Website Settings page.

### AI Pricing Intelligence — BUILT ✅ (2026-03-11)
- **Live:** 3-tier pricing (Fast Sale / Fair Market / Max Return) on every vehicle detail page.
- **Sources:** MarketCheck (live comps) + Groq Compound AI report (web-search) + SerpAPI (KBB snippets) + NHTSA recalls — 4 sources in parallel.
- **Cost:** ~$0.01-0.03/check; 7-day cache keeps monthly cost under $1/dealer for 100-car lots.
- **Dealer Brief integration:** Daily AI brief now includes `pricing_insight` — calls out overpriced vehicles by name, avg premium vs. market, turn rate impact.
- **Pending Phase B:** Wire `computeDealRating()` to public VDP pages (CarGurus-style deal badge).

### AI Listing Description — BUILT ✅ (2026-03-12)
- One-tap "Generate" button in Market Intelligence card on vehicle detail page.
- Calls `POST /api/vehicles/[id]/ai-description` → returns a ready-to-use listing description.
- Copy-to-clipboard button included. "Regenerate" available after first generation.
- Not shown on sold vehicles.

### Inventory Performance Score
- Per-vehicle score: views, days on lot, price vs. market, inquiry rate.
- Red/yellow/green indicator on inventory list.
- Low-score vehicles trigger a "what to do" prompt: drop price / add photos / push to wholesale.
- Makes dealers log in daily to check their "dashboard."
- **Note:** Market data (price vs. FMV) is already computed — this just needs an inventory list UI layer.

### Vehicle Want List — BUILT ✅ (2026-03-13)
- Customers can be added to a want list with fuzzy criteria: year range, vehicle type (pickup/SUV/etc.), make/model optional, max price, notes.
- Bell icon on customer detail page opens WantListSheet (pre-fills from linked vehicle).
- Match engine fires when a vehicle is added, status-changed to available, or promoted from recon.
- Dealer gets push + Telegram alert: "X want list match(es) for [vehicle]."
- Matches appear as Tier 1 blue cards on Today screen (dealer verifies before reaching out).
- Dismiss card when done; customer stays in want list until explicitly cancelled.
- **Pending:** Migration 072 must be applied. `body_style` field not yet in vehicle edit form.
- **Pending Phase B:** Dealer-to-dealer wholesale matching via want list (see Wholesale Network section).

### CSV / DMS Import
- Most independent dealers use Frazer, Dealer Center, or DealerSocket.
- Frazer exports a standard CSV format — one-click import to DealerWyze.
- Eliminates re-entry friction; critical for adoption.
- Effort: low (parse CSV, map fields, bulk insert vehicles).

### Sequences / Autoresponder System — BUILT ✅ (2026-03-13)
- Per-channel (SMS/email) sequences with configurable day offsets and send times.
- Manual / semi-auto / full-auto modes per customer (overrideable globally).
- Re-enrollment capability, STOP/unsubscribe handling (keyword SMS + HMAC email link).
- Settings UI: `app/(app)/settings/sequences/` — list, create, edit steps.
- EnrollSheet component for enrolling customers from Today/customer pages.
- **Pending:** Migration 071 must be applied before feature activates.

### Email Blast to Past Customers
- "Send your new inventory to your customer list" campaign tool.
- Dealer picks a vehicle or "all new arrivals," selects recipients, sends.
- Uses existing email infrastructure (Resend).
- TCPA compliance: only customers who haven't opted out.

---

## Wholesale Dealer Network (Pillar 2 — 12-18 months)

### Real-Time Inventory Matching Alerts
- Dealer A is working a customer who wants a 2019 Silverado 1500 LT.
- Dealer A clicks "Find this vehicle" in the customer record.
- DealerWyze pings all dealers within 100 miles who have a wholesale-eligible match.
- Push notification to Dealer B: "A nearby dealer is looking for your 2020 Silverado — respond to connect."
- Push, not pull. This is how you get adoption from dealers who won't log in proactively.

### Dealer Trust / Reputation System
- Dealers rate each other after wholesale transactions (1-5 stars, verified transactions only).
- "Reliable" badge for dealers with 10+ transactions and 4.5+ rating.
- Critical for trust in the P2P network.

### Condition Report Standard
- `condition_report_json` field already added to vehicles (migration 064).
- Define a standard schema: paint (1-5), interior (1-5), mechanical (1-5), tires (1-5), accident history (Y/N), known issues (text).
- Dealers fill this out when marking a vehicle wholesale_eligible.
- Integration opportunity: partner with Lemon Squad or similar mobile inspectors for verified reports ($75-125/inspection).

### Wholesale Transaction Facilitation
- Flat fee: $75-$125 per completed wholesale transaction.
- Escrow-style: Dealer A pays DealerWyze, DealerWyze pays Dealer B after confirmation.
- No auction, no bidding — fixed price, fast close.
- Integration: Stripe Connect for payouts to dealers.

---

## Revenue Expansion

### Lender Marketplace
- Independent dealers get rejected by banks constantly.
- DealerWyze connects them to a curated panel of subprime/BHPH-friendly lenders.
  (Westlake Financial, CAC, DriveTime wholesale, etc.)
- Every approved deal = referral fee ($200-$500/deal).
- Infrastructure: dealer submits credit app through DealerWyze, lender responds.

### White-Label for Dealer Groups
- A dealer group with 5-8 locations pays $500/mo for a branded version.
- Aggregates all location inventories under one consumer-facing URL.
- "Martinez Auto Group - Browse Our Inventory"
- 5x revenue per account, minimal extra work after initial build.
- Build after marketplace has traction.

### Carfax Affiliate Integration
- Add "View Vehicle History" link (Carfax affiliate) on every VDP.
- Revenue: ~$3-5 per click-through.
- Consumer trust signal — dealers benefit too.
- Implementation: 2 hours + Carfax affiliate application.

---

## North Star Metric

**Published vehicle listings across all dealers.**

Every other growth metric flows from this:
- More published = more SEO pages
- More SEO pages = more consumer traffic
- More consumer traffic = more web leads
- More web leads = dealer sees ROI = stays subscribed + upgrades

Track this weekly in admin dashboard. Target: 10,000 published listings within 6 months of marketplace launch.

---

## Quick Win Backlog (low effort, high impact)

| Feature | Effort | Impact | Status |
|---|---|---|---|
| Vehicle staging + recon workflow | 2 days | High - dealer retention | BUILT |
| Share vehicle via SMS to customer | 2 hrs | High - daily adoption | BUILT |
| Dealer analytics for public pages | 3 hrs | High - retention | BUILT |
| Trade-in estimator (lead capture) | 4 hrs | High - 3x lead volume | BUILT |
| Vehicle intake scanner (VIN barcode + photo AI + NHTSA decode + dupe match) | 1 day | High - intake speed | BUILT |
| Receipt delete on Needs Review cards | 30 min | Medium - UX | BUILT |
| Receipt upload cancel button | 30 min | Medium - UX | BUILT |
| Staging vehicles in receipt assign picker | 30 min | Medium - recon accuracy | BUILT |
| Scan button on Ledger page | 15 min | Low - convenience | BUILT |
| Today page motivational messages (rotating, short) | 1 hr | Low - engagement | BUILT |
| Sequences / Autoresponder (SMS + email, per-channel) | 2 days | High - dealer retention | BUILT (migration pending) |
| Vehicle Want List (fuzzy match, Today Tier 1 alert) | 1 day | High - lead recovery | BUILT (migration pending) |
| Add body_style field to vehicle edit form | 30 min | Medium - want list accuracy | Pending |
| Context-aware scanner (lead/contact/vehicle) | 2 hrs | Medium - UX correctness | Pending |
| Carfax affiliate link on VDP | 2 hrs | Medium - trust + revenue | Pending |
| CSV inventory import (Frazer) | 4 hrs | High - adoption | Pending |
| Days on lot counter on VDP | 1 hr | Medium - urgency | Pending |
| AI listing description generator (vehicle detail) | 1 hr | High - saves dealer time | BUILT |
| AI pricing deal badge on public VDP (computeDealRating wired) | 2 hrs | High - consumer trust | Pending |
| Inventory performance score | 6 hrs | High - engagement | Future |
| Email blast to customer list | 8 hrs | High - dealer value | Future |
