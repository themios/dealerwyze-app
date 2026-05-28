# Project Research Summary

**Project:** RealtyWyze — Phases 2–6 (v2.0 milestone)
**Domain:** Real estate CRM for independent agents and small brokerages, built as a second vertical on DealerWyze's existing multi-tenant SaaS platform
**Researched:** 2026-05-28
**Confidence:** HIGH (architecture from direct codebase inspection; stack from verified official sources; features from competitor and NAR research)

---

## Executive Summary

RealtyWyze is a brownfield build — not a greenfield product. The existing codebase already has the vertical column, RLS infrastructure, RE-specific table columns (migration 179), showings/transactions/commission_plans tables (migration 180), and a public listing site route (`app/[slug]/listings/`). Phases 2–6 extend what already exists rather than architecting from scratch. The primary build risk is not missing features but breaking dealer functionality through shared table pollution, incorrect vertical detection in admin routes, and MLS data licensing violations.

The recommended approach is to ship phases sequentially with tight scope: use RentCast for property data (no direct MLS scraping ever), Apify for Zillow URL import, the existing Remotion Lambda for property videos (new composition only), a second Retell agent_id for RE voice, and DocuSign OAuth for e-signatures (following the Gmail integration pattern already in the codebase). Commission tracking is the highest product complexity risk — it must be modeled as a configurable rule chain (referral fee → royalty → cap → team split → agent net), not a single percentage field. The showing scheduler must ship with Google Calendar two-way sync or not ship at all.

The top legal and compliance risks are MLS data scraping (never do it — use authorized API providers only), CMA output labeled as "valuations" without disclaimer (agent E&O liability), AI voice agent running outbound calls without TCPA consent tracking (default to inbound-only), and DocuSign OAuth tokens stored without refresh logic (transactions get stuck). Each of these is a phase-blocker if not addressed before the relevant phase ships.

---

## Key Findings

### Recommended Stack

The existing stack handles everything through Phase 5 with minimal additions. Net new packages: `apify-client` (Zillow scraping), `docusign-esign` (Phase 5 e-signature), `@calcom/embed-react` (Phase 5 scheduling iframe), and optionally `date-fns` for business-day math. All other phases reuse what is already installed.

**Core technology decisions:**

- **RentCast API** ($74/month Foundation): Property lookup, AVM estimates, and CMA comps — REST/JSON, easy integration. Do NOT use Estated (deprecated 2026) or Bridge Interactive (requires per-MLS data agreements not viable for multi-tenant SaaS).
- **Apify platform** (Zillow actor): URL import scraping — ~$0.003/import at typical agent volumes. DIY Playwright fails on Zillow within days due to Imperva WAF.
- **Claude (existing Anthropic SDK)**: CMA narrative synthesis from RentCast comp data, photo scanning for listing intake. No separate CMA service needed.
- **Retell (second agent_id, same account)**: RE voice agent with distinct system prompt. Add `RETELL_RE_AGENT_ID` env var; branch on `org.vertical` inside existing webhook handler.
- **Remotion Lambda (existing deployment)**: Add `PropertyReel` composition to `remotion/Root.tsx` and rebuild the S3 bundle. Same Lambda renders all compositions by ID.
- **DocuSign eSignature API** (Starter $50/month): Per-org OAuth following the Gmail OAuth pattern already in the codebase. Idempotent webhook + polling fallback required.
- **Cal.com embed** (`@calcom/embed-react`): Phase 5 only, iframe embed. Phase 2 showings use native scheduler with Google Calendar sync.
- **QuickBooks**: CSV export first; live QBO sync deferred. Per-org OAuth is high complexity at v1.

**New env vars required:** `RENTCAST_API_KEY`, `APIFY_API_TOKEN`, `RETELL_RE_AGENT_ID`, `DOCUSIGN_CLIENT_ID`, `DOCUSIGN_CLIENT_SECRET`, `DOCUSIGN_REDIRECT_URI`, `DOCUSIGN_HMAC_KEY`, `CALCOM_CLIENT_ID`, `CALCOM_CLIENT_SECRET`

### Expected Features

**Must have (table stakes):**
- MLS/property data visible against client records (RentCast, not scraping)
- Showing log with outcome and Google Calendar sync
- Offer tracking fields: price, contingencies, expiration, counter status, acceptance date
- Buyer and seller transaction pipelines (separate boards)
- Commission record per closed deal (gross commission, broker split %, agent net)
- DocuSign integration (send/track, not native e-sign)
- Mobile-accessible UI for key flows
- Document storage per transaction (Supabase Storage, already in stack)

**Should have (differentiators):**
- AI voice inbound buyer qualification — 5–7 questions, call summary to CRM, hot-lead SMS alert
- Agent-perspective market alerts ("3 new listings match Sarah's criteria")
- Tiered/capped commission split engine for brokerages
- Post-showing auto-sequence trigger (24h text → 72h email → 7d check-in)
- Broker view: agent roster with deal count, GCI, pipeline per agent
- Public listing site with IDX search and lead-capture gate

**Defer to v2+:**
- QuickBooks live sync (ship CSV export first)
- Cal.com full API integration (ship iframe embed first)
- ShowingTime webhook sync (not confirmed they expose webhooks)
- AI-generated listing descriptions for MLS submission (NAR compliance risk)

**Explicit anti-features — do not build:**
- Native e-signature product
- Direct MLS data parser (use IDX feed vendor)
- Native showing scheduling competing with ShowingTime
- Full accounting/bookkeeping module
- Complex workflow automation builder (opinionated defaults win; adoption failure is RE CRM's #1 problem)

### Architecture Approach

The codebase already has clean vertical isolation. Every new RE route reads `org.vertical` from DB via `requireProfile()` → org lookup, never from request body or `x-vertical` header (which never reaches `/api/` routes — use `getAdminVerticalScope(req)` from host header in all admin routes). Tables `showings`, `transactions`, and `commission_plans` already exist from migration 180 with `org_id NOT NULL` and RLS policies. The public listing site route already exists.

**Major components:**
1. **Listing intake routes** (`app/api/listings/intake/`) — separate from dealer vehicle intake; writes to existing `vehicles` table with RE column set from migration 179
2. **Showings CRUD** (`app/api/showings/`) — top-level resource; migration 189 adds `lockbox_code` and `confirmation_sent_at`
3. **Transactions + Commission Plans** (`app/api/transactions/`, `app/api/commission-plans/`) — migration 189/190 adds DocuSign and milestone fields
4. **Retell RE voice** — extend existing `retell-callback/route.ts` with `org.vertical` branch; new `app/api/voice/re-tools/` for RE mid-call tools
5. **PropertyReel video** — new Remotion composition; rebuild S3 bundle; no Lambda redeployment
6. **DocuSign integration** — Gmail OAuth pattern; tokens in `org_settings`; idempotent webhook at `app/api/webhooks/docusign/`
7. **Public listing site enhancements** — extend `app/[slug]/listings/`; org resolved from subdomain map via service client, never from session

### Critical Pitfalls

1. **MLS data scraping** — Zillow/Redfin ToS prohibit automated scraping. Cease-and-desist forces immediate takedown and data purge. Use RentCast only. Never store scraped data "temporarily."

2. **Dealer route breakage from shared table changes** — Every RE column added to `vehicles` risks breaking 100+ existing dealer routes. All RE columns must be `DEFAULT NULL` and nullable. Run dealer smoke test after every migration touching `vehicles`. Never add a NOT NULL column without a dealer-safe default.

3. **Commission split complexity underestimated** — Real brokerages use graduated splits, annual caps, team splits (3-tier), referral fees, royalty fees, and per-transaction flat fees. A single "split %" field causes immediate churn. Model as a configurable rule chain. Interview real brokers before Phase 3 scope is finalized.

4. **Showing scheduler without Google Calendar sync** — Agents live in Google Calendar. An internal scheduler without sync is unused from day one. Ship with Google Calendar two-way sync or defer the feature.

5. **DocuSign webhook reliability + token expiry** — DocuSign Connect is not guaranteed-instant. Implement idempotent deduplication (`envelopeId + statusChange`) and polling fallback for envelopes stuck >15 minutes. Implement OAuth refresh-on-use; never assume a stored token is valid.

**Additional pitfalls:**
- `x-vertical` never reaches `/api/` — always use `getAdminVerticalScope(req)` in admin API routes
- Public listing site: resolve org from subdomain lookup via service client, never from session
- AI voice: inbound-only at launch; TCPA consent tracking required before enabling outbound; 20 test scenarios minimum
- IDX listing page SEO: canonical tags to authoritative source; noindex search result pages
- Vercel wildcard SSL: `realtywyze.us` nameservers must point to Vercel; implement `pending_ssl` state in schema

---

## Implications for Roadmap

### Phase 2: Listing Intelligence + Showings
**Rationale:** Both phases depend only on already-existing migrations (179, 180). Listing intake gates everything downstream. Showings are the agent's core daily workflow.
**Delivers:** Property search/attach to contact; agent market alerts; showing log with Google Calendar sync; post-showing auto-sequence trigger; PropertyReel video composition
**Key constraint:** Google Calendar sync ships with showings or showings are deferred. No compromise.
**Avoids:** MLS scraping (RentCast only); dealer table pollution (all new columns nullable); `x-vertical` in admin routes

### Phase 3: Transactions + Commission Plans
**Rationale:** Depends on vehicles (listing reference). Commission architecture must be designed as a rule chain before any UI is written.
**Delivers:** Buyer and seller transaction pipelines; offer field set; document attachment; commission plan configuration (fixed and tiered first, capped second); broker agent roster view
**Key constraint:** Interview 2+ real brokers before writing commission code.
**Avoids:** Single "split %" commission model; DocuSign shipped before webhook dedup and polling fallback are ready

### Phase 4: AI Voice (Retell RE Agent)
**Rationale:** Depends on showings (mid-call availability lookup is the primary RE tool call). Retell dashboard configuration precedes code.
**Delivers:** Inbound buyer qualification (5–7 questions), call summary to CRM, hot-lead SMS alert
**Key constraint:** Inbound-only at launch. Minimum 20 recorded test scenarios before shipping.
**Avoids:** Hard-coded linear script; outbound calls without TCPA consent tracking

### Phase 5: Integrations (DocuSign + Cal.com + QuickBooks CSV)
**Rationale:** Depends on transactions (DocuSign envelopes attach to transaction records). Third-party OAuth integrations are isolatable.
**Delivers:** DocuSign send/track from transaction record; Cal.com iframe embed; CSV commission export
**Key constraint:** DocuSign developer account and sandbox credentials before code starts. Cal.com is iframe-only at v1.
**Avoids:** Native e-signature; static env var token storage; QuickBooks live sync complexity at v1

### Phase 6: Public Listing Site Enhancements
**Rationale:** `app/[slug]/listings/` already exists. This phase adds SEO strategy, lead capture gate, behavioral tracking, and subdomain provisioning UX. Depends on all preceding phases.
**Delivers:** IDX search on realtywyze.us subdomains; lead capture gate → CRM contact; canonical tag strategy; `pending_ssl` subdomain provisioning state
**Key constraint:** `realtywyze.us` nameservers must point to Vercel before subdomain feature is built. Verify before Phase 6 begins.
**Avoids:** Public page resolving org from session; indexable thin search pages; wildcard SSL errors at agent launch

### Phase Ordering Rationale

- Phases 2–3 sequenced by DB dependency: showings and transactions both reference vehicles; building out of order requires stub data.
- Phase 4 (voice) after showings: the RE agent's primary mid-call tool is showing availability lookup.
- Phase 5 (integrations) after transactions: DocuSign envelopes only make sense attached to transaction records.
- Phase 6 last: aggregates data from all prior phases for the public-facing product.

### Research Flags

**Needs deeper research during planning:**
- **Phase 2 (IDX vendor):** Confirm which MLS boards cover target tenant geography before spec is finalized. Board approval timelines 30–90 days — start vendor approval process during Phase 2 development.
- **Phase 2 (Google Calendar API):** Per-agent OAuth, event creation with invites, two-way status sync. Not researched in detail. Critical dependency for showing scheduler.
- **Phase 3 (commission data model):** Validate data model against real brokerage commission plans before writing code.
- **Phase 5 (DocuSign API tier):** Verify whether "Rooms for Real Estate" tier is needed vs. standard eSignature API.

**Standard patterns — skip dedicated research phase:**
- **Phase 4 (Retell):** Second agent_id pattern verified and documented. Branch-in-existing-webhook is clear.
- **Phase 6 (subdomain routing):** Vercel wildcard + Next.js middleware is documented. Existing middleware in codebase handles similar rewriting.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | RentCast, Apify, Retell multi-agent, Remotion multi-composition, Vercel wildcard all verified against official docs |
| Features | MEDIUM-HIGH | Table stakes verified across FUB, kvCORE, Wise Agent, NAR research. Differentiator specifics depend on IDX vendor not yet selected. |
| Architecture | HIGH | Based on direct codebase inspection. Migration 179/180 confirmed. Existing routes inspected. |
| Pitfalls | HIGH (legal/data), MEDIUM (edge cases) | MLS legal risks, commission complexity, DocuSign reliability are well-sourced. Some architecture edge cases are inference from patterns. |

**Overall confidence:** HIGH for build decisions; MEDIUM for IDX vendor selection (requires market geography validation)

### Gaps to Address

- **IDX vendor selection:** RentCast covers AVM/comps but not live MLS listing feeds. A separate IDX feed vendor (SimplyRETS, Spark API, Trestle, Bridge Interactive) is required for full listing intelligence and the public listing site. Must confirm MLS board coverage for target tenant geography before Phase 2.
- **Google Calendar API for showings:** Per-agent OAuth, event creation with invites, two-way status sync. Needs implementation research before Phase 2 spec is written.
- **ShowingTime webhook availability:** Assume it does not expose webhooks for third-party CRM sync. Build native showing log without ShowingTime dependency.
- **DocuSign "Rooms for Real Estate" vs. standard eSignature API:** Affects Phase 5 pricing and scope. Verify before Phase 5 planning.
- **MLS board approval timeline:** Some boards take 30–90 days. Start vendor approval during Phase 2 development, not after.

---

## Sources

### Primary (HIGH confidence)
- RentCast API: https://developers.rentcast.io/reference/introduction
- Remotion Lambda: https://www.remotion.dev/docs/lambda
- Retell AI agents: https://docs.retellai.com/build/single-multi-prompt/prompt-overview
- Vercel wildcard subdomains: https://vercel.com/docs/multi-tenant
- DocuSign pricing: https://ecom.docusign.com/plans-and-pricing/developer
- DocuSign Node SDK: https://github.com/docusign/docusign-esign-node-client
- Cal.com embed: https://cal.com/docs/platform/quickstart
- Apify pricing: https://apify.com/pricing
- Bridge Interactive: https://bridgedataoutput.com/docs/platform/Introduction
- QuickBooks token behavior: https://www.getknit.dev/blog/quickbooks-online-api-integration-guide-in-depth

### Secondary (MEDIUM confidence)
- Zillow anti-bot 2026 benchmark: https://dev.to/agenthustler/zillow-scraping-in-2026-anti-bot-defenses-api-alternatives-and-benchmark-results-17ll
- Commission split complexity: https://theclose.com/real-estate-commission-splits/
- DocuSign webhook reliability: https://www.docusign.com/blog/developers/dsdev-polling-vs-webhooks
- IDX duplicate content SEO: https://www.realestatewebmasters.com/seo-guide/seo-guide-duplicate/
- Vercel wildcard SSL: https://vercel.com/blog/wildcard-domains
- MLS scraping legal exposure: https://agentiveaiq.com/blog/can-you-legally-scrape-zillow-what-real-estate-pros-need-to-know
- RE CRM feature landscape: https://www.ihomefinder.com/blog/agent-and-broker-resources/real-estate-crm-features-2026/
- Retell AI voice qualification: https://www.retellai.com/blog/how-to-automate-real-estate-lead-qualification-ai
- CMA accuracy/liability: https://www.berxi.com/resources/articles/real-estate-errors-and-omissions-claim-story/

---

*Research completed: 2026-05-28*
*Ready for roadmap: yes*
