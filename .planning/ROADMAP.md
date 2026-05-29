# Roadmap — RealtyWyze v2.0: Full Feature Build

**Milestone:** v2.0
**Defined:** 2026-05-28
**Depth:** Standard
**Coverage:** 47/47 requirements mapped

---

## Overview

RealtyWyze v2.0 builds the complete RE deal pipeline on top of the vertical foundation from v1.1. Phases 7–13 transform the platform from a branded shell into a full RE CRM: listings imported from any source, showings tracked and synced, transactions and commissions managed end-to-end, AI voice qualification, a public listing site per agency, and DocuSign integration. All work runs inside the existing one-codebase/one-DB architecture without breaking dealer functionality.

---

## Pre-Build Actions (Parallel to Phase 7)

These are not phase tasks — they are vendor approvals and API keys that must be started immediately because they block later phases.

| Action | Blocks | Urgency |
|--------|--------|---------|
| Submit iHomeFinder IDX approval application | Phase 12 public site IDX sourcing (v2) | Start NOW — 30–90 day process |
| Interview 2 brokers about commission split structures | Phase 9 (TXN-05/06) | Before Phase 9 starts |
| Obtain RentCast API key ($74/mo) | Phase 7 (LIST-03, LIST-05) | Before Phase 7 code |
| Obtain Apify API key + test Zillow actor | Phase 7 (LIST-01) | Before Phase 7 code |
| Create Retell RE agent in dashboard; set RETELL_RE_AGENT_ID | Phase 11 (VOICE-01–05) | Before Phase 11 starts |
| Create DocuSign developer sandbox; get CLIENT_ID + CLIENT_SECRET | Phase 13 (INT-01–03) | Before Phase 13 starts |
| Verify Cal.com Platform API tier for multi-org booking | Phase 8 (SHOW-06/07) | Before Phase 8 starts |

---

## Phase Structure

| Phase | Name | Goal | Requirements | Migration(s) |
|-------|------|------|--------------|-------------|
| 7 | Listing Intelligence | Agent can import a listing from any source with AI assistance | LIST-01–07 (7) | 189–191 |
| 8 | Showings | Agent can schedule, track, and sync showings across all channels | SHOW-01–08 (8) | 192–193 |
| 9 | Transactions & Commissions | Broker can manage deal pipeline and agent commission splits | TXN-01–08 (8) | 194–195 |
| 10 | Listing Video | Agent can generate a branded video from a listing record | VID-01–03 (3) | none |
| 11 | AI Voice (Retell RE) | RE office can deploy an AI phone agent for inbound buyer qualification | VOICE-01–05 (5) | 196 |
| 12 | Public Listing Site | Each RE agency gets a public, SEO-indexed listing site | PUB-01–08 (8) | 197 |
| 13 | Integrations | Agent can send documents for e-sign and export commission data | INT-01–06 (6) | 198–199 |

---

## Phase Details

---

### Phase 7 — Listing Intelligence

**Goal:** Agent can import a listing from any source — URL paste, photo scan, or MLS number — and have the system pre-fill the listing form with AI-extracted data, with a confirmation step before saving.

**Dependencies:** None (builds on existing vehicles table + scan-image/parse-text patterns from dealer vertical)

**Architecture constraints:**
- `vehicles` table stores RE listings — any additive migration must include a dealer smoke-test gate before deploy
- Apify actor handles URL scraping (not DIY — Zillow ToS + CFAA exposure)
- RentCast API backs MLS# lookup and CMA generation
- Claude Vision backs photo/flyer scan (reuses `app/api/vehicles/intake/scan-image/route.ts` pattern)
- All imports scope to `requireProfile()` org — never request-supplied org_id (LIST-06)
- Migration 189: additive columns on `vehicles` for RE-specific fields (list_price, dom_start_date, price_history jsonb, showing_count)
- Migration 190: `cma_reports` table (org_id, vehicle_id, rentcast_response jsonb, generated_at)

**Requirements:**
- LIST-01: URL import via Apify (Zillow, Redfin, Realtor.com → address, beds, baths, sq ft, price, photos)
- LIST-02: Photo/flyer scan via Claude Vision → AI extracts address, beds, baths, price, sq ft
- LIST-03: MLS# import via RentCast API → writes to vehicles table with RE fields
- LIST-04: Listing performance metrics view: days on market, price history, showing count
- LIST-05: CMA generation via RentCast AVM + comps, displayed as a formatted report
- LIST-06: All imports respect org scoping — listing belongs to authenticated agent's org only
- LIST-07: URL and photo imports show a confirmation preview before saving; agent can correct AI-extracted fields

**Success Criteria:**
1. Agent pastes a Zillow URL and sees a pre-filled listing form (address, beds, baths, price, photos populated) in under 5 seconds, with a confirmation step before the record saves.
2. Agent uploads a listing flyer photo and sees AI-extracted fields appear in the form; incorrect fields can be edited before saving.
3. Agent enters an MLS# and the listing record is created with data from RentCast without any manual field entry.
4. Agent opens a listing detail page and sees days on market, price change history, and showing count without navigating away.
5. Agent clicks "Generate CMA" on a listing and receives a formatted comparable analysis report within 15 seconds.

**Plans:** 4 plans in 3 waves

Plans:
- [ ] 07-01-PLAN.md — Migrations 189/190/191 + apify-client install + env vars
- [ ] 07-02-PLAN.md — URL import (LIST-01) + photo scan (LIST-02) API routes and lib
- [ ] 07-03-PLAN.md — MLS# import (LIST-03), metrics API (LIST-04), CMA API (LIST-05)
- [ ] 07-04-PLAN.md — UI: import buttons + confirmation form, metrics panel, CMA display, price tracking

---

### Phase 8 — Showings

**Goal:** Agent can schedule, track, and sync showings across CRM, Cal.com self-serve booking, and Google Calendar — with zero manual entry when buyers book through the public link.

**Dependencies:** Phase 7 (listings must exist to attach showings to)

**Architecture constraints:**
- `showings` table exists from migration 180 — Phase 8 extends it additively (migration 192: add `cal_event_id`, `gcal_event_id`, `feedback_notes`, `status` enum if not present)
- Cal.com integration is iframe embed for agent-facing link + webhook for buyer self-serve (SHOW-07)
- Google Calendar sync reuses Gmail OAuth token store pattern; migration 193 for gcal_tokens if not already present
- Cal.com webhook endpoint must validate HMAC signature, be replay-safe, and rate-limited
- SMS/email reminders fire via existing Twilio/Resend infrastructure — no new send path needed

**Requirements:**
- SHOW-01: Schedule a showing with date, time, buyer contact, and notes
- SHOW-02: Agent receives SMS/email reminder before scheduled showing
- SHOW-03: Agent can mark showing as completed, cancelled, or no-show
- SHOW-04: All showings for a listing displayed chronologically on listing detail page
- SHOW-05: Agent can view all upcoming showings across all listings in a calendar/list view
- SHOW-06: Agent can embed a Cal.com booking link on a listing
- SHOW-07: Cal.com webhook creates a showing record in CRM automatically
- SHOW-08: Showing create/update/cancel syncs to agent's connected Google Calendar

**Success Criteria:**
1. Agent creates a showing on a listing; the listing detail page immediately shows it in the showings list without a page reload.
2. Agent receives an SMS and email reminder before a scheduled showing.
3. Buyer clicks a Cal.com booking link embedded on a listing, books a time, and a showing record appears in the agent's CRM dashboard with no manual entry required.
4. Agent marks a showing "No-show" and the status is reflected in both the listing's showing list and the agent's calendar view.
5. When a showing is created or cancelled in CRM, the agent's connected Google Calendar updates within 60 seconds.

**Plans:** 6 plans in 4 waves

Plans:
- [ ] 08-01-PLAN.md — Migration 192 + updateCalendarEvent() + calWebhookLimiter + CALCOM_WEBHOOK_SECRET env
- [ ] 08-02-PLAN.md — Showings CRUD API: POST/GET /api/showings + PATCH/DELETE /api/showings/[id] (SHOW-01, SHOW-03, SHOW-08)
- [ ] 08-03-PLAN.md — Cal.com webhook /api/cal/webhook: HMAC, dedup, BOOKING_CREATED/CANCELLED/RESCHEDULED (SHOW-07)
- [ ] 08-04-PLAN.md — Showing reminders cron job in check-tasks (SHOW-02)
- [ ] 08-05-PLAN.md — ShowingTimeline UI on listing detail: list, status controls, schedule form, Cal.com link (SHOW-01 UI, SHOW-03 UI, SHOW-04, SHOW-06)
- [ ] 08-06-PLAN.md — /showings dashboard page + GET /api/showings/upcoming (SHOW-05)

---

### Phase 9 — Transactions & Commissions

**Goal:** Broker can track every deal from offer to close and see accurate commission splits for every agent in the org, based on a configurable commission plan.

**Dependencies:** Phase 7 (listing must exist), Phase 8 (showing count informs deal activity)

**Pre-build gate:** Broker interviews completed before coding TXN-05/06.

**Architecture constraints:**
- `transactions` and `commission_plans` tables exist from migration 180 — extend additively (migration 194)
- Migration 194: add `parties jsonb`, `final_sale_price`, `closed_date`, `commission_calculation jsonb`, `stage` enum to transactions; extend `commission_plans` with tier/cap/referral structures
- Migration 195: commission summary view or materialized for YTD aggregation
- Commission calculation runs server-side at transaction close, stored in `commission_calculation jsonb` — not recalculated on every read
- Broker-only routes verify org admin role — agents cannot modify commission plans
- BHPH ledger is conceptual reference only — transactions are a separate flow; do not share tables

**Requirements:**
- TXN-01: Create a transaction for a listing (buyer, amount, date, contingencies, expiry)
- TXN-02: Update transaction through stages: Offer → Under Contract → Inspection → Appraisal → Closing → Closed
- TXN-03: Record closing date and final sale price
- TXN-04: Log all parties (buyer agent, seller agent, title company, lender)
- TXN-05: Broker configures commission split plans (flat %, tiered/graduated, capped, referral deduction)
- TXN-06: Transaction auto-calculates gross commission and agent split based on active plan at close
- TXN-07: Agent views commission summary: YTD earnings and per-transaction breakdown
- TXN-08: Broker views commission summary across all agents in the org

**Success Criteria:**
1. Agent creates a transaction on a listing, advances it stage by stage, and records the final sale price at close — all without leaving the listing detail view.
2. At close, the transaction page shows gross commission, agent split, and broker split calculated automatically from the active commission plan — no spreadsheet needed.
3. Broker opens commission plan settings, sets a tiered split (70/30 up to $5k GCI, 80/20 above), saves, and the next closed transaction reflects the new structure.
4. Agent opens their commission summary and sees YTD total and per-deal breakdown sortable by close date.
5. Broker opens the org commission report and sees all agents' YTD totals and individual deal breakdowns.

**Plans:** 6 plans in 4 waves

Plans:
- [ ] 09-01-PLAN.md — Migrations 193/194/195: extend transactions, extend commission_plans, close_re_transaction RPC
- [ ] 09-02-PLAN.md — Transaction CRUD API (TXN-01/02/03/04)
- [ ] 09-03-PLAN.md — Commission Plans CRUD API (TXN-05)
- [ ] 09-04-PLAN.md — TransactionPanel UI on listing detail page (TXN-01/02/03/04 UI)
- [ ] 09-05-PLAN.md — Close transaction API + dialog + commission settings page (TXN-05 UI, TXN-06)
- [ ] 09-06-PLAN.md — Commission summary API + page (TXN-07/08)

> Note: TXN-08 (Remotion RE listing video) is deferred to Phase 10. In this roadmap TXN-08 refers to broker all-agents commission view, which is covered in plan 09-06.

---

### Phase 10 — Listing Video

**Goal:** Agent can generate a branded listing showcase video from a listing record and share or post it without leaving RealtyWyze.

**Dependencies:** Phase 7 (listing record with photos must exist)

**Architecture constraints:**
- New Remotion composition `REListingShowcase` — separate from all dealer video templates
- Remotion Lambda render path already exists; new composition registered alongside existing compositions
- No new migrations required — video render output stored via existing storage/activities pattern
- RE video template must not import or reference any dealer-specific branding constants

**Requirements:**
- VID-01: Generate a listing showcase video from a listing record (address, photos, price, beds/baths on branded RE template)
- VID-02: RE listing video uses dedicated Remotion composition "REListingShowcase" (not dealer templates)
- VID-03: Generated video can be downloaded or posted to connected social accounts

**Success Criteria:**
1. Agent opens a listing, clicks "Generate Video", and receives a downloadable MP4 in under 3 minutes showing the listing address, price, bed/bath count, and photo slideshow with RealtyWyze branding.
2. The generated video contains zero dealer-vertical branding (no DealerWyze logo, no auto-specific text).
3. Agent posts the generated video to a connected social account from the listing page without downloading first.

---

### Phase 11 — AI Voice (Retell RE Agent)

**Goal:** RE office can deploy a dedicated AI phone agent that qualifies inbound buyers and routes hot leads to the agent immediately.

**Dependencies:** Phase 7 (listings exist so agent can describe inventory context)

**Pre-build gate:** `RETELL_RE_AGENT_ID` env var must be set before any code is deployed.

**Architecture constraints:**
- Separate Retell agent ID (`RETELL_RE_AGENT_ID`) — no coupling to dealer agent (`RETELL_AGENT_ID`)
- New Retell callback route `app/api/voice/re-callback/route.ts` — does not touch dealer voice routes
- Migration 196: `re_voice_config` table (org_id, retell_phone_number, greeting_override, enabled, created_at)
- Hot lead escalation fires via existing Twilio SMS send path
- RE agent config page in org settings, gated by `vertical = 'real_estate'` server-side check
- Call summary and qualification data stored as an activity record on the matched/created customer

**Requirements:**
- VOICE-01: RE org can enable an AI phone agent (separate Retell agent, dedicated RE persona)
- VOICE-02: Retell RE agent qualifies callers: timeline, budget, pre-approval, target neighborhoods, current agent status
- VOICE-03: Qualified lead from call is automatically created or matched in CRM with call summary + qualification data
- VOICE-04: Hot lead escalation: agent notified via SMS if caller meets qualification threshold
- VOICE-05: RE org can configure their Retell phone number and agent greeting from org settings

**Success Criteria:**
1. Broker enables the AI voice agent from org settings, enters the Retell phone number, and a test inbound call is answered by the AI agent with the configured greeting.
2. After a qualifying call, a new lead (or matched existing customer) appears in the CRM within 60 seconds with the call summary and qualification fields (budget, timeline, pre-approval status) populated.
3. When a caller meets the hot-lead threshold, the assigned agent receives an SMS notification within 90 seconds of call completion.
4. RE org admin updates the AI greeting text in org settings and the next inbound call uses the updated greeting without a code deploy.

---

### Phase 12 — Public Listing Site

**Goal:** Each RE agency has a public, SEO-indexed listing site at [slug].realtywyze.us where buyers can browse active listings and submit inquiries that flow into the CRM.

**Dependencies:** Phase 7 (listings must exist to display)

**Pre-build gate:** iHomeFinder IDX approval application submitted (this phase uses manual listing data; IDX feed is v2).

**Architecture constraints:**
- Public routes under `app/[slug]/` — NO auth assumed, no session required
- Org detection: wildcard subdomain → `agency_slugs` table lookup (slug → org_id) — never trust request body for org identity
- No cross-tenant data leak possible: all queries filter by org_id derived from slug lookup only
- Wildcard SSL: `*.realtywyze.us` via Vercel (already configured for two-domain architecture)
- Migration 197: `agency_slugs` table (slug unique, org_id FK, created_at) + `agency_site_settings` (org_id, logo_url, primary_color, contact_email, bio)
- Public inquiry form: Zod-validated, rate-limited via Upstash, creates a `leads` record scoped to the org — replay-safe
- SEO: listing pages server-rendered with `generateMetadata`, Open Graph tags, and JSON-LD `RealEstateListing` structured data
- Public routes must never render data from a different org even if slug collision is attempted

**Requirements:**
- PUB-01: Each RE agency gets a public listing site at [slug].realtywyze.us
- PUB-02: Broker/admin sets their agency's slug from org settings (unique across platform)
- PUB-03: Public site shows all active listings with search/filter by beds, baths, price range
- PUB-04: Each listing has a public detail page with photos, description, agent contact, and inquiry form
- PUB-05: Inquiry form submission creates a lead in CRM and sends agent a notification
- PUB-06: Public listing pages have SEO metadata (title, description, Open Graph, JSON-LD structured data)
- PUB-07: Subdomain-to-org lookup is secure — no cross-tenant data possible
- PUB-08: Agency can customize public site: logo, primary color, contact info, bio

**Success Criteria:**
1. Broker sets their slug to "coastal-realty" in org settings; navigating to `coastal-realty.realtywyze.us` shows their active listings within 10 seconds of slug save.
2. A buyer filters the public listing site by 3+ beds under $500k and only matching listings from that agency appear — no listings from other agencies visible under any URL manipulation.
3. Buyer submits an inquiry on a listing detail page; a new lead record appears in the agent's CRM dashboard within 30 seconds and the agent receives an email notification.
4. A listing detail page passes Google's Rich Results Test with valid JSON-LD structured data.
5. Navigating to `other-agency.realtywyze.us/listings/[id-from-different-org]` returns a 404, not cross-tenant data.

---

### Phase 13 — Integrations

**Goal:** Agent can send transaction documents for e-signature via DocuSign, receive webhook notifications for key RE events, and export commission data for accounting — all from within RealtyWyze.

**Dependencies:** Phase 9 (transactions must exist for DocuSign envelopes), Phase 12 (listing_created event source)

**Architecture constraints:**
- DocuSign OAuth follows the Gmail integration pattern (`app/api/integrations/docusign/`)
- DocuSign tokens stored server-side in `docusign_connections` table — never in localStorage or cookies
- Migration 198: `docusign_connections` (org_id, access_token encrypted, refresh_token encrypted, expires_at, account_id)
- Migration 199: `platform_webhooks` (org_id, endpoint_url, secret, events jsonb, last_fired_at, failure_count)
- Outbound webhook delivery: HMAC-SHA256 signed payload, retry with exponential backoff (max 3 attempts), failure logged to `platform_webhooks.failure_count`
- CSV export is server-rendered streamed response — no file stored in DB
- DocuSign sandbox used throughout Phase 13; production OAuth requires DocuSign production app approval (separate process)

**Requirements:**
- INT-01: Agent connects DocuSign from org settings (OAuth flow)
- INT-02: Agent sends a DocuSign envelope from a transaction record (select template, add signers, send)
- INT-03: DocuSign envelope status (sent, viewed, completed, declined) visible on transaction record
- INT-04: Platform exposes webhooks for: listing_created, showing_scheduled, offer_received, transaction_closed
- INT-05: Agent exports commission data as CSV in QuickBooks-compatible format
- INT-06: Webhooks authenticated with HMAC signatures and support retry on failure

**Success Criteria:**
1. Agent clicks "Connect DocuSign" in org settings, completes OAuth, and sees a confirmation that the connection is active — without leaving RealtyWyze.
2. Agent opens a transaction, selects a DocuSign template, adds two signers, sends the envelope, and the transaction record updates to "Sent" status — all in under 2 minutes.
3. When a signer completes the DocuSign envelope, the transaction record in RealtyWyze updates to "Completed" within 5 minutes via DocuSign webhook.
4. Agent clicks "Export to QuickBooks" on the commission summary page and receives a CSV download with columns matching QuickBooks import format (Transaction Date, Description, Amount, Category).
5. A third-party tool subscribed to `transaction_closed` receives a signed payload within 60 seconds of a transaction being marked closed, and re-delivery succeeds if the first attempt fails.

---

## Progress Table

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 7 — Listing Intelligence | Import from URL, photo, or MLS# with AI confirmation | LIST-01–07 | Pending |
| 8 — Showings | Schedule, track, sync showings across channels | SHOW-01–08 | Pending |
| 9 — Transactions & Commissions | Deal pipeline + commission splits + reporting | TXN-01–08 | Pending |
| 10 — Listing Video | Branded RE video from listing record | VID-01–03 | Pending |
| 11 — AI Voice | Retell RE agent: qualify callers + hot lead escalation | VOICE-01–05 | Pending |
| 12 — Public Listing Site | Per-agency public site, SEO-indexed, secure | PUB-01–08 | Pending |
| 13 — Integrations | DocuSign e-sign, webhooks, QuickBooks CSV export | INT-01–06 | Pending |

**Coverage:** 47/47 v1 requirements mapped. 0 orphans.

---

## Architecture Rules (All Phases)

These rules apply to every phase. Violating them is a blocker before merge.

1. **Vertical scoping:** All API routes read `vertical` from the authenticated org via `requireProfile()`. Never from request body or `x-vertical` header.
2. **Admin routes:** Always use `getAdminVerticalScope(req)` (reads host header). Never `x-vertical`.
3. **Public listing site (Phase 12):** No auth. Org detection via `agency_slugs` table only. No cross-tenant data possible regardless of URL manipulation.
4. **vehicles table migrations:** Any migration touching `vehicles` requires a dealer smoke test gate in the deploy checklist before production.
5. **Migration numbering:** Start at 189. Every migration is additive. Destructive changes require explicit rollback path.
6. **Service-role policy:** Follow CLAUDE.md rules. New org-scoped handlers use `createClient()` + `requireProfile()`.
7. **Dealer compatibility:** Every phase must leave dealer vertical functionality unchanged. Add `vertical = 'real_estate'` guards on any new RE-only UI or API routes.

---

*Roadmap created: 2026-05-28 — v2.0 milestone, Phases 7–13, 47 requirements*
*Phase 8 plans added: 2026-05-28 — 6 plans in 4 waves*
