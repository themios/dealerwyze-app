# Feature Landscape: RealtyWyze CRM — Phases 2–6

**Domain:** Real estate CRM for independent agents and small brokerages (1–20 agents)
**Researched:** 2026-05-28
**Confidence:** MEDIUM–HIGH (WebSearch verified against official docs and platform pages)

---

## Already Built (Phase 1 Baseline)

These exist and are NOT re-scoped here:
- Lead/client CRM with pipeline stages
- SMS/email sequences and templates
- AI daily brief
- Content pipeline and social posting
- Review requests
- Retention campaigns

---

## Table Stakes

Features agents expect. Missing = product feels broken or unprofessional. Agents will not pay without these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| MLS/IDX listing data display | Agents live in MLS data; every serious RE tool surfaces it | High | IDX requires MLS board approval + RESO Web API feed or third-party (iHomeFinder, IDX Broker). Don't build direct MLS parsing — use a feed vendor. |
| Showing request/log tracking | Core daily workflow; agents schedule 3–15 showings/week | Medium | Don't need to replace ShowingTime (MLS-integrated). Need a lightweight internal log: property address, date/time, buyer contact, outcome, follow-up task. |
| Offer tracking with key fields | Every buyer transaction needs offer status visible in pipeline | Medium | Fields: offer price, list price, offer date, contingencies (inspection, financing, appraisal), expiration, counter status, acceptance/rejection date. |
| Transaction pipeline (buyer + seller) | Separate pipelines for buyer and seller deals is table stakes in RE | Medium | Buyer pipeline: prospect → showing → offer → under contract → closed. Seller pipeline: listing → active → offer accepted → under contract → closed. |
| Commission split tracking (basic) | Every closed deal needs a commission record, even solo agents | Medium | At minimum: gross commission, brokerage split %, agent net, referral fees deducted. Tiered/capped splits needed for brokerages (see Differentiators). |
| E-signature integration | Agents send/receive signed docs at offer, listing agreement, and closing stages | High | DocuSign and Dotloop dominate. Build as integration (OAuth + send-for-signature API), not a native e-sign product. Agents already have accounts. |
| Mobile-accessible UI | Agents work from phones at open houses, in cars, at properties | Medium | Full Next.js responsive already helps. Critical flows (contact view, showing log, task complete) must work one-handed on mobile. |
| Document/file storage per transaction | Inspection reports, disclosures, contracts attached to a deal | Medium | Supabase Storage already in stack. Transaction-scoped document folders. |

---

## Differentiators

Features that set RealtyWyze apart from Follow Up Boss, kvCORE/BoldTrail, and Wise Agent. Not required to get started, but drive retention and word-of-mouth.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI voice for inbound buyer calls | 87% of leads go unanswered after hours; first responder wins 78% of clients (NAR 2025) | High | Retell already in stack. Buyer qualification script: timeline, budget, pre-approval status, neighborhoods, agent status. Route hot leads (pre-approved, <3 months) to agent immediately. Log call summary + score to CRM. |
| Listing intelligence (market activity feed) | Agents want to know when a property near their client's target area goes active, cuts, or sells | High | Requires IDX feed. Surface saved-search alerts from agent's perspective, not just buyer's. "3 new listings match your client Sarah's criteria." |
| Public listing site with IDX search | Agents want to capture leads on their own site, not Zillow | High | IDX embed + lead-capture registration gate on save/tour actions. Biggest differentiator vs. standalone CRM tools that require separate website vendors. kvCORE wins deals on this alone. |
| Behavioral lead scoring from listing activity | Leads that view 10+ listings and save searches are hot; automate the trigger | Medium | Requires IDX activity webhooks into CRM. Auto-task creation: "Sarah viewed 7 listings this week — call her." FUB does this well; RealtyWyze can match it. |
| Commission split engine (tiered + capped) | Small brokerages managing 3–15 agents need automated split math | Medium | Fixed %, tiered graduated (milestone-based), flat fee + 100%, and capped models (agent keeps 100% after annual cap hit). Per-transaction fee layer. This alone replaces spreadsheet chaos. |
| Showing outcome → auto sequence trigger | Post-showing follow-up is universally manual; automating it is a real time-saver | Medium | After logging a showing: trigger 24-hour text ("What did you think?"), 72-hour email with similar listings, 7-day check-in. Already have sequences — wire to showing events. |
| AI-generated offer summary / CMA context | When writing an offer, surface recent sold comps for the address automatically | High | Requires IDX/MLS data access. Low-confidence feature — MLS data licensing may restrict AI synthesis. Flag for legal review. |
| Agent roster + performance dashboard (broker view) | Brokers managing 5–15 agents need a single view of pipeline, deal count, and GCI per agent | Medium | Broker role sees aggregated: deals in pipeline per agent, closed volume YTD, commission earned vs. cap. This is a retention driver for brokerage signups. |

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Native e-signature product | DocuSign and Dotloop have MLS form libraries, legal compliance teams, and audit trails that take years to build. Agents trust DocuSign, not a startup e-sign. | Integrate via DocuSign API (send envelope, track status, webhook on complete). $10–$20/month DocuSign plans are acceptable to agents. |
| Building a direct MLS data parser | MLS boards are fragmented (700+ in US), RETS is dead, RESO Web API is complex, and access requires board membership. This is a 6-month distraction. | Use IDX feed vendors (iHomeFinder, IDX Broker, Showcase IDX). They handle board compliance, licensing, and data freshness. |
| Native showing scheduling (replacing ShowingTime) | ShowingTime is MLS-integrated and pre-installed in most agents' workflows via their board. Competing with it means convincing listing agents on the other side to use your platform. | Log showings in RealtyWyze as internal records. Sync confirmed ShowingTime bookings via webhook if they offer one. Don't fight the network. |
| Overly complex workflow automation builder | 88% of agent conversations never make it into any CRM. Adoption failure is the #1 CRM problem in RE. Complex drag-and-drop automation builders get ignored. | Opinionated defaults with simple on/off toggles. Pre-built playbooks for common scenarios (new buyer, post-showing, under contract). Don't build a Zapier replacement. |
| Full accounting / bookkeeping module | Transaction commission tracking is needed. Full P&L, expense tracking, and tax prep is not — and building it invites scope creep, compliance risk, and user confusion. | Export commission statements as CSV or PDF. Let agents use QuickBooks/Wave for accounting. Integrate via Zapier or webhook. |
| AI-generated listing descriptions for public MLS | MLS boards restrict AI-generated listing content in some markets. NAR ethics rules apply. Compliance exposure is real. | Offer AI writing assistance for marketing copy (social posts, email campaigns) where RealtyWyze already controls the channel. Keep it off MLS submission fields. |
| Built-in video conferencing | Agents use Zoom. This is solved. Adding a video tool adds maintenance burden with zero differentiation. | Deep link to Zoom/Google Meet. |
| Crypto / blockchain transaction recording | Appears in 2025 RE-tech marketing. Irrelevant to independent agents and small brokerages. | Ignore. |

---

## Feature Dependencies

```
IDX Feed (vendor) → Listing Intelligence → Behavioral Lead Scoring
IDX Feed (vendor) → Public Listing Site → Lead Capture → CRM Contact
Showing Log → Auto Sequence Trigger → Follow-up Tasks
Transaction Pipeline → Commission Record → Split Engine (broker only)
Transaction Pipeline → E-signature Integration → Document Storage
AI Voice (Retell) → Call Summary → CRM Lead Score + Task
Broker Role → Agent Roster View → Performance Dashboard
```

**Critical gate:** IDX feed vendor selection must happen before Phases 1 (Listing Intelligence) and 5 (Public Listing Site). Everything that touches property data depends on it.

---

## Phase-by-Phase Feature Breakdown

### Phase 2 — Listing Intelligence
**Table stakes:** MLS listing data visible against client records
**Differentiator:** Agent-perspective market alerts ("X new listings match your client's criteria")
**MVP scope:** IDX feed vendor integration, property search/attach to contact, saved search alerts

### Phase 3 — Transactions and Showings
**Table stakes:** Showing log, offer tracking fields, transaction pipeline (buyer + seller)
**Differentiator:** Post-showing auto-sequence trigger
**MVP scope:** Transaction record, showing log with outcome, offer field set, document attachment
**Avoid:** Replacing ShowingTime or building native calendar scheduling

### Phase 4 — Commission Splits
**Table stakes:** Per-transaction commission record with basic split
**Differentiator:** Tiered/capped/flat-fee engine for brokerages, per-agent performance view
**MVP scope:** Fixed % and simple tiered models first. Capped model second. Per-transaction fee layer third.
**Complexity note:** Small brokerages run 2–3 split models simultaneously for different agent tiers. Build the data model to support multiple plan types per org before writing any calculation logic.

### Phase 5 — AI Voice for RE
**Table stakes:** Inbound call handling that doesn't go to voicemail after hours
**Differentiator:** Structured lead scoring + call summary auto-logged to CRM, hot-lead escalation
**MVP scope:** Retell agent with buyer qualification script (6 questions), call log to CRM, hot-lead SMS alert to agent
**Qualification script must cover:** Timeline, budget, pre-approval status, neighborhoods/property type, current agent status, property type (buyer/seller/renter filter)

### Phase 6 — Public Listing Site
**Table stakes:** Agent-branded site with IDX property search
**Differentiator:** Lead capture gate (save search / request tour), behavioral tracking → CRM lead score
**MVP scope:** Subdomain site per org, IDX embed, registration gate, lead-to-CRM sync
**Biggest risk:** IDX vendor terms and board approval timelines. Some boards take 30–90 days to approve new vendors. Start vendor approval process during Phase 2.

---

## MVP Recommendation (if forced to cut)

If each phase must have a single highest-value deliverable:

1. **Listing Intelligence** — Attach a property (address + MLS data) to a contact record. Everything else in this phase builds on that.
2. **Transactions and Showings** — Showing log + offer fields + transaction pipeline. The post-showing sequence is the differentiator that ships second.
3. **Commission Splits** — Fixed % split on a transaction record. Tiered/capped complexity ships to brokerages in v2 of this phase.
4. **AI Voice** — Inbound buyer qualification with call summary to CRM. Hot-lead escalation is the must-have; showing booking from voice is post-MVP.
5. **Public Listing Site** — IDX property search on agent subdomain with lead capture gate. Skip custom design tooling; ship one clean template.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Table stakes features | HIGH | Verified across multiple RE CRM platforms (FUB, kvCORE, Wise Agent), NAR research, official product pages |
| Differentiators | MEDIUM | Pattern from competitor gap analysis; behavioral scoring specifics depend on IDX vendor API capabilities |
| Commission split complexity | HIGH | Verified via TotalBrokerage docs, Keller Williams/eXp/Real public plan pages |
| AI voice qualification questions | HIGH | Verified via Retell AI official blog and Phonely AI template docs |
| IDX/MLS integration approach | MEDIUM | Feed vendor landscape verified; specific vendor API capabilities need phase-specific investigation |
| E-signature integration scope | HIGH | DocuSign official pricing and API docs confirm integration vs. build decision |
| Anti-feature rationale | MEDIUM | MLS restriction on AI content is LOW confidence — needs legal/board-specific verification |

---

## Open Questions (Flag for Phase Research)

1. **IDX vendor selection** — iHomeFinder, IDX Broker, and Showcase IDX all have different pricing models, API capabilities, and MLS board coverage. RealtyWyze needs to confirm which boards Tim's target customers belong to before committing to a vendor.
2. **MLS board approval timeline** — Some boards require a separate application per brokerage subscriber. Understand whether RealtyWyze is the applicant or the agent/broker.
3. **DocuSign API tier** — The "Rooms for Real Estate" API is separate from standard eSignature API. Verify which tier is needed for transaction-room-style workflows.
4. **Commission split taxation** — Does RealtyWyze need to generate 1099 forms or just commission statements? 1099 generation requires IRS compliance work; commission statements do not.
5. **ShowingTime webhook availability** — Confirmed ShowingTime exists in most MLS boards; not confirmed whether they expose webhooks for third-party CRM sync.

---

## Sources

- iHomeFinder: https://www.ihomefinder.com/blog/agent-and-broker-resources/real-estate-crm-features-2026/
- Follow Up Boss vs kvCORE comparison: https://justarealtor.com/follow-up-boss-vs-kvcore/
- Retell AI buyer qualification: https://www.retellai.com/blog/how-to-automate-real-estate-lead-qualification-ai
- TotalBrokerage commission plans: https://www.totalbrokerage.com/blog/understanding-agent-commission-plans
- DocuSign for Real Estate: https://www.docusign.com/solutions/industries/real-estate
- AgentFire CRM comparison: https://agentfire.com/blog/top-crms-real-estate/
- Inman: 88% of conversations never reach CRM: https://www.inman.com/2025/11/12/why-88-of-agent-conversations-never-make-it-to-the-crm/
- NAR speed-to-lead: referenced via IDX Broker blog: https://blog.idxbroker.com/how-to-improve-speed-to-lead-on-your-real-estate-website-with-idx-broker/
- ShowingTime market position: https://showingtime.com/
- Commission split structures (theclose): https://theclose.com/real-estate-commission-splits/
