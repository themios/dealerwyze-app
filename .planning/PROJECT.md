# Wyze Platform (DealerWyze + RealtyWyze)

## What This Is

A multi-tenant SaaS CRM platform with two live verticals: DealerWyze (used-car dealerships) and RealtyWyze (real estate offices and agents). Each vertical shares one codebase, one Supabase DB, and one Vercel deployment, distinguished by a `vertical` column on organizations and host-based routing. Apollo Auto (dealer) and Themio Realty (RE) are internal test tenants.

## Core Value

Every org's data stays completely isolated from every other org's data — and every vertical's admin view shows only its own orgs. A breach of tenant isolation or vertical scoping is an existential failure.

## Requirements

### Validated

- ✓ Multi-tenant org isolation via Supabase RLS + authenticated profile scoping
- ✓ Lead capture and CRM workflow (leads, customers, vehicles/listings, activities, tasks)
- ✓ SMS/MMS via Twilio with opt-out compliance
- ✓ Email via Gmail integration with IMAP/SMTP and push webhooks
- ✓ BHPH payment ledger with token-based reminders (dealer vertical)
- ✓ Inventory/listing management with documents, photos, and AI summarization
- ✓ Platform admin with staff impersonation, org lifecycle, vertical scoping
- ✓ Stripe billing and subscription gating
- ✓ Upstash Redis-backed rate limiting for SMS, AI, and public endpoints
- ✓ Vercel deployment with staging and production scripts
- ✓ Service-role narrowing (v1.1), CI gates, 116 tests, audit logging
- ✓ RealtyWyze vertical: branding, nav, string sweep, admin split, feature flags, vertical-scoped admin API routes (migrations 178–188)
- ✓ Two-domain architecture: dealerwyze.com + realtywyze.us, one Supabase project
- ✓ Admin panel vertical scoping: getAdminVerticalScope(req) reads host header (x-vertical never reaches /api/* routes)

### Active (Milestone v2.0 — RealtyWyze Full Feature Build)

**Phase 2 — Listing Intelligence:**
- [ ] Agent can import a listing by pasting a Zillow/Redfin/Realtor.com URL
- [ ] Agent can scan a listing photo/flyer to auto-fill listing fields
- [ ] Agent can import a listing by MLS# via data provider API
- [ ] Agent can view listing performance (days on market, price changes, showing count)
- [ ] Agent can generate a CMA (Comparative Market Analysis) for a listing

**Phase 3 — Transactions, Showings & Commissions:**
- [ ] Agent can schedule showings on a listing with date/time/buyer contact
- [ ] Agent can track offers on a listing (amount, contingencies, status, expiry)
- [ ] Agent can manage a transaction timeline from offer to close
- [ ] Broker can configure commission split plans per agent or deal type
- [ ] Agent can generate a Remotion listing video (RE video template)

**Phase 4 — AI Voice (Retell RE Agent):**
- [ ] RE office gets a dedicated Retell AI agent (separate from dealer voice)
- [ ] Retell RE agent answers inbound calls and qualifies buyers (budget, timeline, pre-approval)
- [ ] RE agent config is manageable from org settings

**Phase 5 — Public Listing Site:**
- [ ] Each RE agency gets a public listing site at [slug].realtywyze.us
- [ ] Public listing pages are SEO-indexable (metadata, structured data)
- [ ] Agency can customize their public site (logo, colors, contact info)
- [ ] Listing pages include inquiry form that creates a lead in CRM

**Phase 6 — Integrations:**
- [ ] Agent can connect DocuSign or Dotloop for e-signatures on offers/contracts
- [ ] Agent can embed a Calendly/Cal.com link for self-serve showing booking
- [ ] Platform exposes webhooks for key RE events (offer accepted, closing complete)
- [ ] Agent can export commission data to QuickBooks-compatible format

### Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first; not in current roadmap |
| Real-time collaborative editing | No current use case |
| Full test coverage (100%) | Target is integration coverage of high-risk paths |
| Auth system replacement | Supabase Auth is working and validated |
| Custom domain per agency (public site) | Subdomain-first; custom domain deferred to post-revenue |
| IDX/MLS direct feed subscription | High cost, complex compliance; MLS# lookup via API is sufficient for v2 |
| Full QuickBooks sync | Export format only; full bi-directional sync is v3 |
| GPS / field crew tracking | Out of scope for RE CRM |

## Context

**Architecture (as of 2026-05-24):**
- `proxy.ts` (Next.js 16 middleware) injects `x-vertical` for PAGE routes only — API routes bypass matcher
- Admin API routes must use `getAdminVerticalScope(req)` which reads `host` header directly
- `platform_feature_flags`, `affiliate_codes`, `platform_settings` all have `vertical` column (migrations 185–187)
- Unique constraint on `platform_feature_flags` is now `(flag_key, vertical)` (migration 188)
- Content org IDs: `CONTENT_MCP_ORG_ID` (dealer), `RE_CONTENT_MCP_ORG_ID` (Themio Realty: d775c4f7)
- Migration numbering: next available is 189+

**RE patterns to reuse for Phase 2:**
- `app/api/vehicles/intake/scan-image/route.ts` → adapt for listing photo scan
- `app/api/vehicles/intake/parse-text/route.ts` → adapt for URL/text paste
- `app/(public)/` routes → adapt for public listing site
- Retell dealer voice → separate RE agent in Retell dashboard + new route config
- Remotion Lambda → new RE listing video template

**Commission/transaction patterns:**
- BHPH module (`bhph_contracts`, `bhph_payment_ledger`) as conceptual reference for transactions
- `showings` and `transactions` tables exist from migration 180 (may need extension)
- `commission_plans` table exists from migration 180

## Constraints

- **Security**: Never trust org_id from request input — always derive from `requireProfile()`
- **Vertical isolation**: Admin API routes always use `getAdminVerticalScope(req)`; never `x-vertical` header
- **Multi-tenancy**: Every DB read/write in a request handler must be scoped to authenticated org
- **Compatibility**: No breaking changes to existing dealer functionality
- **Stack**: Next.js App Router, TypeScript, Supabase, Vercel — no stack changes
- **Migration numbering**: Start at 189; each migration is additive and reversible where possible

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase RPC for BHPH atomicity | Postgres transactions not available from edge; RPC gives atomicity | — Pending |
| Upstash for distributed state | Consistent across Vercel instances and cold starts | ✓ Good |
| x-vertical never reaches /api/ routes | proxy.ts matcher excludes /api/*; host header is the reliable signal | ✓ Good |
| One Google Cloud project for both verticals | Both share same Supabase auth; DealerWyze project handles login for both | — Pending |
| Agency subdomain (slug.realtywyze.us) for public site | Simpler than custom domain management; custom domain as future paid tier | — Pending |
| Separate Retell RE agent (not extending dealer agent) | Clean RE persona, no coupling to dealer prompts | — Pending |
| URL scraper first, photo scan second, MLS API third | Build in order of cost/complexity; validate demand before API contract | — Pending |

---
*Last updated: 2026-05-28 — v2.0 milestone started: RealtyWyze full feature build (Phases 2–6)*
