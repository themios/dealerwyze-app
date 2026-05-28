# Domain Pitfalls: RealtyWyze Phases 2–6

**Domain:** Real estate CRM (listing intelligence, transaction management, AI voice, public sites)
**Context:** RE features built on top of existing DealerWyze multi-tenant SaaS
**Researched:** 2026-05-28
**Confidence:** HIGH for data/legal risks, MEDIUM for architecture edge cases

---

## Critical Pitfalls

Mistakes that cause rewrites, legal exposure, or loss of dealer tenants.

---

### Pitfall 1: MLS Data Scraping — TOS Violation and Legal Exposure

**What goes wrong:** Team builds listing intelligence by scraping Zillow, Redfin, or individual MLS board sites to populate CMA data or listing feeds. Zillow's ToS explicitly prohibits automated scraping without written permission. Redfin's terms forbid screen scraping and commercial reuse of listing content. Enforcement via cease-and-desist or civil breach-of-contract action.

**Why it happens:** Scraping feels fast; signing up with an MLS API provider feels slow. Teams rationalize that "public data" = fair use. It isn't — the CFAA doesn't protect you from breach-of-contract claims.

**Consequences:** Injunctive relief forces immediate takedown of the CMA or listing intelligence features. Any data stored from scraping may need to be purged. Reputational harm to RE agents whose clients see the product disappear.

**Prevention:**
- Use an authorized MLS data aggregator from day one: SimplyRETS, Bridge Interactive (Stellar MLS), Spark API, Trestle, or MLS Grid.
- Agents must have an active MLS membership; data access is gated through their board credentials, not your platform credentials.
- Never store scraped listing data as a shortcut while "waiting for API access."

**Warning signs:**
- Anyone on the team says "we'll scrape it for now and switch later."
- CMA feature is spec'd without a line item for MLS API licensing cost.

**Phase most at risk:** Phase 2 (Listing Intelligence / IDX Feed). This is the first phase where real MLS data is needed.

---

### Pitfall 2: MLS API Coverage Gaps — Not All Boards Are Covered

**What goes wrong:** You sign with one MLS aggregator (e.g., SimplyRETS) and discover your early RE tenants are in markets not covered by that aggregator. Their listings don't appear, IDX feed is empty, and the feature looks broken.

**Why it happens:** No single national MLS exists. Aggregators like SimplyRETS, Spark API, Bridge, and Trestle each have different board partnerships. Coverage maps change. Some local boards only support RETS (deprecated) not RESO Web API.

**Consequences:** Feature rollout is blocked for tenants in uncovered markets. You either maintain multiple provider integrations or restrict which markets you serve at launch.

**Prevention:**
- Before Phase 2 begins, map your first 5–10 target RE tenants to their MLS board and verify that board is covered by the chosen aggregator.
- Build the IDX integration layer with an abstraction (one MLS client interface, multiple provider adapters) so swapping or adding providers doesn't require rewriting consuming code.
- Explicitly scope Phase 2 to "covered markets only" — gate onboarding with a market eligibility check.

**Warning signs:**
- A prospective tenant signs up from a rural market or a region dominated by a niche local MLS board.
- Provider's coverage map hasn't been verified against actual tenant geography.

**Phase most at risk:** Phase 2 (IDX Feed). Also Phase 3 if CMA data relies on the same feed.

---

### Pitfall 3: CMA Accuracy — Data Quality Creates Liability

**What goes wrong:** Agents use auto-generated CMA reports to advise clients on pricing. MLS data contains errors: wrong square footage, outdated sold prices (average MLS price overstatement is 6.7% per Washington Post), listings not yet marked off-market. Agent prices a listing based on bad CMA data; client loses money; agent faces E&O claim.

**Why it happens:** Developers treat CMA as a calculation problem. It's actually a data quality problem. MLS boards can only be as accurate as what agents input, and data entry errors are endemic.

**Consequences:** NAR Article 2 holds agents responsible for content accuracy regardless of the tool that generated it. Wrong CMA output = professional liability exposure for the agent = churn and legal pressure on RealtyWyze.

**Prevention:**
- CMA output must include a disclaimer: "Based on MLS data as of [date]. Verify comps independently before advising clients."
- Always surface the data freshness timestamp prominently (when was each comp last updated from the MLS feed).
- Never label CMA output as a "valuation" — it is a "market analysis" based on comparable sales.
- Build in comp selection transparency: show agents exactly which properties were used and let them exclude outliers.

**Warning signs:**
- CMA screen shows a price estimate with no data timestamp.
- Product copy uses the word "valuation" or "property value."
- No mechanism for agents to review and override the selected comps.

**Phase most at risk:** Phase 3 (CMA / Listing Intelligence enhancements).

---

### Pitfall 4: Commission Split Complexity Underestimated — Causes Churn

**What goes wrong:** Commission tracking is built assuming a simple percentage split (agent 70%, broker 30%). Real brokerages use: graduated splits (split changes after agent hits a revenue threshold), annual cap systems (agent pays broker until a cap is met, then keeps 100%), team splits (broker takes cut first, then team leader takes a cut, then agent gets remainder), referral fees (off-the-top deduction before any split), royalty fees (franchise brokerages add a fixed percentage on top of the split), transaction fees (flat per-deal fees in addition to percentage splits).

**Why it happens:** Phase 3 scope describes "commission tracking" and the developer implements the 70/30 model they saw in the first article they read.

**Consequences:** Brokers find the commission module useless for their actual plan. This is the #1 reason real estate CRM products get abandoned. Brokers switch tools rather than try to work around broken commission math.

**Prevention:**
- Before building any commission UI, interview at least 2 real brokers about their split structure. Ask: "Walk me through exactly how the last 3 transactions were split."
- Model commission as a rule chain: deductions applied in sequence (referral fee → royalty fee → broker cap check → team split → agent net).
- Build commission plan as a configurable template per agent, not a global setting per org.
- Ship a simple version (flat split) with explicit roadmap note that cap, team, and referral logic comes in the next iteration. Communicate this limitation at onboarding.

**Warning signs:**
- Commission spec has a single "split %" field.
- No concept of annual reset or cap tracking.

**Phase most at risk:** Phase 3 (Transaction Management / Commission Tracking).

---

### Pitfall 5: DocuSign Webhook Reliability — Transaction Status Gets Stuck

**What goes wrong:** Transaction milestones (listing agreement signed, offer accepted, closing docs signed) are driven by DocuSign envelope status webhooks. Webhooks are not delivered instantly — DocuSign's own docs state "messages are not delivered instantly after the event occurs." If the webhook is missed or delayed, the transaction record shows the wrong status. Agents see stale state; they distrust the system.

**Why it happens:** Developer tests the happy path (sign → webhook fires → status updates) and ships. Edge cases: webhook fires while the API route is cold-starting, duplicate webhook deliveries create race conditions on the envelope record, OAuth token expires mid-signature-flow.

**Consequences:** Agents manually track transaction status in a spreadsheet alongside the CRM, defeating the entire purpose of the transaction management feature.

**Prevention:**
- Implement idempotent webhook handler: every DocuSign Connect event must be deduplicated by `envelopeId + statusChange` before processing.
- Implement a polling fallback: for any envelope in a non-terminal state for more than 15 minutes, schedule a status check via cron rather than waiting for webhook.
- Store OAuth refresh tokens in Supabase with automatic refresh before expiry; never assume a stored token is valid.
- Test DocuSign OAuth token refresh explicitly in staging.

**Warning signs:**
- Webhook handler has no deduplication logic.
- No fallback polling for stuck envelopes.
- OAuth token stored as a static env var instead of a refreshable token pair.

**Phase most at risk:** Phase 3–4 (Transaction Management).

---

### Pitfall 6: AI Voice Agent — Wrong Questions Lose Buyer Leads

**What goes wrong:** Retell RE agent asks too many qualification questions (more than 8), feels like an interrogation, and leads hang up. Or the agent follows a fixed script and can't handle a mid-call pivot (buyer asks about a different ZIP code; agent loops back to the original script). Or the agent is placed on outbound cold calls in a market where TCPA requires prior written consent.

**Why it happens:** Developer copies a qualification checklist from a real estate training website and hard-codes it into the agent prompt. No testing with real buyer calls. No handling for off-script inputs.

**Consequences:** Low answer rate and high early hang-up rate. Agents stop using the AI calling feature. Potential TCPA violation for outbound calling without written consent.

**Prevention:**
- Limit qualification to 5–7 questions maximum. Prioritize: timeline, budget, pre-approved?, area, property type.
- Design the agent around intent detection, not a linear script. Each question should have branch logic for "not sure," "already have a property in mind," "just browsing."
- For outbound calls: build consent tracking (when and how consent was collected) before enabling outbound calling. Default to inbound-only at launch.
- Test with real calls before shipping: at minimum, run 20 test scenarios including off-script pivots.
- Implement call recording with agent review UI so brokers can QA the AI's performance.

**Warning signs:**
- Agent prompt is a flat list of questions with no branching logic.
- No consent tracking for outbound calls.
- Feature ships without a minimum of 20 recorded test scenarios reviewed by a human agent.

**Phase most at risk:** Phase 4 (Retell RE Voice Agent). Also onboarding flow if agent is defaulted to active.

---

### Pitfall 7: Public Listing Site — Vertical Detection Without Auth

**What goes wrong:** Public listing pages (e.g., `agent.realtywyze.us`) have no authenticated session. The page must still know which org it belongs to to fetch that org's listings, use their branding, and show the right contact info. Without a robust resolution strategy, the page either serves wrong data, crashes with a null org, or is ungated (serves any org's listings if you know the URL pattern).

**Why it happens:** All other parts of the app derive org context from the authenticated session. The public site has none. Developers forget this and reach for `session.user.org_id` which returns null.

**Consequences:** Public pages show no data (blank site), show wrong org's data, or expose listings from one tenant on another tenant's public page.

**Prevention:**
- Resolve org from subdomain or custom domain, not from session. Store the mapping in a `public_sites` or `agent_profiles` table with `(subdomain, org_id)` keyed lookup.
- This lookup must use the service role client (no RLS) since there is no authenticated user.
- Make the lookup result read-only: public pages can read listing data but cannot write anything.
- Add an existence check: if no org matches the subdomain, return 404 — never fall through to a default org.

**Warning signs:**
- Public page route handler imports `createClient()` (user-scoped) instead of `createServiceClient()`.
- No `public_sites` or equivalent table mapping subdomains to orgs.
- Public page passes `org_id` as a query param instead of deriving it from the host header.

**Phase most at risk:** Phase 5 (Public Listing Site / Agent Profile Pages).

---

### Pitfall 8: Dealer Route Breakage — Shared Table Extensions for Listings

**What goes wrong:** The `vehicles` table is extended with RE-specific columns (`bedrooms`, `bathrooms`, `lot_size`, `hoa_fee`, `zoning`, `mls_number`, etc.). Existing dealer queries that `SELECT *` or build TypeScript types from the table schema start returning unexpected columns, breaking type inference or UI rendering. RLS policies added for RE listing visibility accidentally affect dealer vehicle visibility.

**Why it happens:** The "extend not rename" decision was correct to preserve 100+ existing routes, but each new column added to `vehicles` is a landmine for dealer code that assumes a specific schema shape.

**Consequences:** Dealer tenants see broken vehicle detail pages, incorrect type errors in TypeScript, or (worst case) RLS changes that hide their vehicles from their own agents.

**Prevention:**
- All RE-specific columns on `vehicles` must have a `DEFAULT NULL` and must be nullable. Never add a NOT NULL column to `vehicles` without a dealer-safe default.
- Create a TypeScript type alias: `type Listing = Vehicle` initially, but plan the migration path to a separate `listings` table when RE columns exceed 10–12.
- After every migration that touches `vehicles` or `vehicle_*` tables, run a smoke test against the dealer vehicle list, vehicle detail, and vehicle create flows.
- RLS policy changes on `vehicles` must explicitly re-validate dealer-scoped policies in a separate test pass.
- Add a CI step or checklist item: "Does this migration touch shared tables? Run dealer smoke test."

**Warning signs:**
- A migration adds a NOT NULL column to `vehicles`.
- A new RLS policy on `vehicles` uses `vertical` without explicitly preserving the existing dealer policy.
- TypeScript build passes but dealer vehicle detail page shows `undefined` for a field.

**Phase most at risk:** Phase 2 (first RE-specific columns added to `vehicles`). Also any phase that adds RLS changes to shared tables.

---

### Pitfall 9: Public Listing Site — SEO Duplicate Content from IDX

**What goes wrong:** Listings displayed on the agent's RealtyWyze public site are the same MLS data served to every other IDX site in the area. Google sees thousands of sites with identical listing content and assigns low authority to all of them, including yours. The agent's site never ranks.

**Why it happens:** IDX feeds push the same property data to every participating site. Without canonical tag strategy, every listing page is duplicate content.

**Consequences:** Public listing site is invisible to Google. Agents don't get organic leads. They don't see the value of the public site feature and stop using it.

**Prevention:**
- Use canonical tags pointing to the MLS board or authoritative source for IDX-sourced listing detail pages. This cedes the ranking but protects the site's overall domain authority.
- For the agent's own listings (properties they represent), use `rel="canonical"` pointing to this page — these can rank since the agent controls the listing copy.
- Noindex thin search-results pages (all listings in ZIP 78701). Only index listing detail pages and neighborhood pages with original content.
- Encourage agents to add original content to each listing (their own description, neighborhood commentary) — this is the only way to differentiate from other IDX sites.

**Warning signs:**
- Public listing pages have no `<link rel="canonical">` tag.
- All listing pages including search result pages are indexable.
- Listing descriptions are pulled verbatim from MLS with no agent-added content layer.

**Phase most at risk:** Phase 5 (Public Listing Site). Also Phase 2 if IDX listing pages are added before the SEO strategy is in place.

---

### Pitfall 10: Vercel Wildcard Subdomains — SSL Provisioning Lag and Nameserver Requirement

**What goes wrong:** Agent profile subdomains (e.g., `janesmith.realtywyze.us`) require Vercel to issue individual SSL certificates on demand. If Vercel's DNS challenge can't resolve (nameservers not pointing to Vercel), the cert fails silently. Vercel's API may return `verified: true` before the cert is actually ready, causing agents to see SSL errors on their new site.

**Why it happens:** Wildcard SSL for subdomains requires Vercel nameserver control for automated DNS challenges. If the apex domain (`realtywyze.us`) uses a third-party DNS provider (Cloudflare, etc.), wildcard cert issuance breaks.

**Consequences:** Agents share their new profile URL with clients; clients see a certificate error and assume the site is fraudulent. First impression of a brand-new feature is a security warning.

**Prevention:**
- Confirm `realtywyze.us` nameservers point to Vercel before building subdomain provisioning.
- Add a "provisioning" state in the database: new subdomains are in `pending_ssl` status until the cert is confirmed via Vercel API poll (not just the initial response).
- Show agents a "Your site is being set up, check back in 30 minutes" UI while cert provisions.
- DNS propagation for subdomains is 5–30 minutes; apex changes can be longer. Test this in staging end-to-end before shipping to production.

**Warning signs:**
- `realtywyze.us` DNS is managed in Cloudflare with Cloudflare nameservers.
- No `pending_ssl` or equivalent subdomain provisioning state in the schema.
- Subdomain feature tested only with localhost or Vercel preview URLs, not with a real wildcard domain.

**Phase most at risk:** Phase 5 (Public Listing Site / Agent Profiles with subdomains).

---

### Pitfall 11: Showing Scheduler — Calendar Sync Is Table Stakes, Not a Differentiator

**What goes wrong:** Showing scheduler is built as an internal RealtyWyze-only calendar. Agents already live in Google Calendar. They refuse to adopt a second calendar. Showing requests pile up in RealtyWyze while agents manage actual showings in Google. Data diverges. Agents stop using the scheduler.

**Why it happens:** Calendar sync (Google Calendar API) is more complex to build than an internal scheduling UI, so developers ship the UI-only version first and treat sync as "Phase 2."

**Consequences:** The showing scheduler is unused from day one. It's not a "we'll add sync later" problem — agents will not switch to a new scheduling tool without sync in place from the start.

**Prevention:**
- Showing scheduler must launch with Google Calendar two-way sync or not launch at all.
- iCal export is not sufficient — agents need events to appear in Google Calendar automatically, not after clicking an export button.
- Minimum viable showing scheduler = create showing → creates Google Calendar event on agent's calendar → buyer receives calendar invite → agent confirms in Google Calendar → status reflected in RealtyWyze.

**Warning signs:**
- Showing scheduler spec includes calendar sync as a "future enhancement."
- Showing scheduler is specced with its own calendar view but no Google Calendar integration.

**Phase most at risk:** Phase 3 (Open House / Showing Scheduler).

---

### Pitfall 12: Vertical Leakage in Admin API Routes

**What goes wrong:** `x-vertical` header is set by proxy.ts and passed to server components. But proxy.ts's `config.matcher` excludes `/api/` routes. Admin API routes that read `x-vertical` from the request header get `undefined` on `realtywyze.us/admin` requests, causing the admin panel to show dealer orgs instead of RE orgs, or crash.

**Why it happens:** This is a documented existing known issue in the codebase (per memory: "x-vertical never reaches API routes"). Developers building Phase 2–6 admin features forget to use `getAdminVerticalScope(req)` and reach for the header instead.

**Consequences:** Admin filtering by vertical silently fails. Platform superuser reviewing RE tenant activity sees dealer data. Support actions applied to wrong org.

**Prevention:**
- All admin API route handlers that need vertical context MUST use `getAdminVerticalScope(req)` (reads host header, not x-vertical).
- Add a lint rule or code review checklist item: "No admin API route may read `x-vertical` directly from headers."
- Add an integration test: call `/api/admin/[route]` with a `Host: realtywyze.us` header and assert the response scope is `real_estate` only.

**Warning signs:**
- Admin API route contains `request.headers.get('x-vertical')`.
- New admin routes for RE features are built by copy-pasting existing dealer admin routes without checking vertical detection pattern.

**Phase most at risk:** All phases that touch admin features. Highest risk in Phase 2 when first RE-specific admin routes are added.

---

## Phase-Specific Warning Summary

| Phase | Topic | Highest Risk Pitfall | Mitigation |
|-------|--------|---------------------|------------|
| Phase 2 | IDX Feed | MLS API coverage gaps + vehicles table breakage | Verify board coverage before tenant onboarding; smoke test dealer flows after every migration |
| Phase 2 | Listing source | Zillow/Redfin scraping | Use authorized MLS API only; no scraping |
| Phase 3 | CMA | Data accuracy liability | Timestamp + disclaimer on all CMA output |
| Phase 3 | Commission | Underbuilt split logic | Interview real brokers; model as rule chain |
| Phase 3 | Showing scheduler | No Google Calendar sync | Sync is not optional; ship with sync or defer |
| Phase 3–4 | Transactions | DocuSign webhook reliability | Idempotent handler + polling fallback |
| Phase 4 | Retell RE agent | TCPA + script rigidity | Inbound-only default; 20 test scenario minimum |
| Phase 5 | Public site | Vertical detection without auth | Org from subdomain map, not session |
| Phase 5 | Public site | SEO duplicate content | Canonical tags + noindex search pages |
| Phase 5 | Public site | SSL provisioning lag | Vercel nameserver control + pending_ssl state |
| All | Admin panel | x-vertical not in API routes | Always use `getAdminVerticalScope(req)` |
| All | Shared tables | Dealer route breakage | Dealer smoke tests after every vehicles migration |

---

## Sources

- SimplyRETS IDX Developer API: https://simplyrets.com/idx-developer-api
- Spark API overview: https://sparkplatform.com/docs/overview/api
- Zillow scraping legal analysis: https://agentiveaiq.com/blog/can-you-legally-scrape-zillow-what-real-estate-pros-need-to-know
- CMA accuracy and liability: https://www.berxi.com/resources/articles/real-estate-errors-and-omissions-claim-story/
- MLS data quality errors: https://www.nar.realtor/magazine/real-estate-news/sales-marketing/how-and-why-to-avoid-errors-in-mls-listings
- AI real estate voice agent failures: https://www.retellai.com/blog/how-to-automate-real-estate-lead-qualification-ai
- AI voice agent comparison: https://getperspective.ai/blog/ai-voice-agents-for-real-estate-in-2026-7-options-compared-by-conversation-depth
- DocuSign webhook reliability: https://www.docusign.com/blog/developers/dsdev-polling-vs-webhooks
- DocuSign high concurrency race conditions: https://www.esignglobal.com/blog/docusign-api-handling-recipient-locked-errors-high-concurrency
- Vercel wildcard subdomain SSL provisioning: https://vercel.com/blog/wildcard-domains
- Vercel domain management: https://vercel.com/docs/multi-tenant/domain-management
- IDX duplicate content SEO: https://www.realestatewebmasters.com/seo-guide/seo-guide-duplicate/
- IDX SEO canonical tags: https://realtyna.com/blog/real-estate-marketing/seo/canonical-tag/
- Commission splits complexity: https://theclose.com/real-estate-commission-splits/
- Remotion Lambda cold start and cost: https://www.remotion.dev/docs/lambda/cost-example
