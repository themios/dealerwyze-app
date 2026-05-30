# v2 Requirements Planning

Deferred features and roadmap for RealtyWyze Phase 2–6.

---

## Overview

**v1 Status:** MVP complete (basic CRM, sequences, SMS, voice)

**v2 Goal:** Industry-specific features for Real Estate

**Timeline:** Post-launch, per demand and user feedback

---

## Phase 2: Listing Intelligence

### MLS Integration

**What:** Auto-fetch property data from MLS/IDX databases

**Why:** Agents manually filling property details = friction; auto-fill saves time

**Tech Stack:**
- ATTOM API, Estated, or Bridge Interactive (MLS data providers)
- Zillow/Realtor.com URL scraper (fallback)
- Photo AI extraction (detect address, beds/baths from listing photos)

**Features:**
- Search by address/MLS# → auto-populate beds, baths, price, sqft
- Price history & days on market tracking
- CMA (Comparative Market Analysis) — auto-generate comp reports

**Effort:** 3–4 weeks

---

## Phase 3: Transactions & Commissions

### Transaction Management

**What:** Track offers, contingencies, closing timeline

**Why:** Agents coordinate multiple deal steps; CRM should track all phases

**Features:**
- Offer tracking (list price → offer → accepted → contingencies → closing)
- Contingency reminders (inspection, appraisal, funding)
- Closing checklist & timeline
- Earnest money & deposit tracking

### Commission Plans

**What:** Define split structures (agent %, referral %, broker %)

**Why:** Multi-agent teams need commission tracking

**Features:**
- Commission split management
- Automatic payout calculation
- Referral fee tracking
- Dispute resolution notes

### Showings Scheduler

**What:** Schedule and track property showings

**Why:** Agents coordinate showings with other agents

**Features:**
- Public showing calendar (integrated with showing services)
- Feedback collection (buyer feedback forms post-showing)
- Showing history per property

**Effort:** 5–6 weeks

---

## Phase 4: AI Voice (Retell Enhancement)

### RE-Specific Agent

**What:** Voice agent trained for real estate (not dealership)

**Why:** Different conversation flow (property questions, buyer questions vs. vehicle questions)

**Features:**
- Property inquiry handling ("What's the status of 123 Main St?")
- Buyer qualification (budget, timeline, pre-approval)
- Showing scheduling (offer times, coordination)
- Voicemail transcription

**Tech:** Retell AI + custom system prompts

**Effort:** 2–3 weeks

---

## Phase 5: Public Listing Site

### Agency Website

**What:** SEO listing pages per agency (like DealerWyze public_website)

**Why:** Agents want public-facing site for leads/SEO

**Features:**
- Property detail pages (indexed by Google)
- Neighborhood landing pages
- Lead capture forms
- Agent profiles
- Search & filters

**Tech:** Next.js App Router, Vercel hosting

**Effort:** 4–5 weeks

---

## Phase 6: Integrations

### DocuSign/Dotloop

**What:** E-signature integration for contracts

**Why:** Agents coordinate document signing

**Tech:** OAuth flow, signed document webhook

### Calendly/Showing Scheduler

**What:** Self-serve scheduling (buyers book showings)

**Why:** Reduce back-and-forth coordination

**Tech:** Calendly API or custom scheduler

### Zapier/Webhooks

**What:** Automation bridge (connect to external tools)

**Why:** Agents use multiple tools (Zillow, Stripe, etc.)

**Features:**
- Webhook out (trigger actions in other apps)
- Webhook in (trigger actions from other apps)

### QuickBooks Integration

**What:** Auto-export commission payouts

**Why:** Accounting integration reduces manual entry

**Tech:** QuickBooks API, OAuth

**Effort:** 2–3 weeks per integration

---

## Deferred (Not in v1–6)

### AI Video Generation

**Why:** Complex, expensive, lower priority
**Tech:** Remotion Lambda (exists) + RE templates

### AI Document Review

**Why:** Legal/compliance complexity
**Tech:** Claude API + contract parsing

### MLS Syndication

**Why:** MLS compliance/rules complexity
**Tech:** MLS RETS protocol

### Lead Scoring

**Why:** Statistical model, requires data
**Tech:** Claude API + historical data

---

## Validation Needed (Ask Agents)

- [ ] MLS integration: Top 1–3 data providers?
- [ ] Commission tracking: Preferred split structures?
- [ ] Showing scheduler: Integrate with existing (Showing Time, Zillow) or build custom?
- [ ] Public site: How important vs. other features?

---

## Success Metrics (v2 Complete)

- [ ] 50+ properties indexed by Google
- [ ] Showing coordination reduces back-and-forth time
- [ ] Commission tracking reduces disputes
- [ ] AI voice agent handles 30%+ of inbound calls
- [ ] User satisfaction: NPS ≥ 45

---

## Files to Update

- Update `.planning/ROADMAP.md` with v2 phases
- Add Phase 2–6 to `.planning/REQUIREMENTS.md` (v2 section)
- Link this doc from `PROJECT.md`

---

## References

- [Real Estate CRM Features](https://www.capterra.com/real-estate-crm-software/#comparisons)
- [MLS Data Providers](https://www.mls.com/home)
- [Retell AI Capabilities](https://docs.retellai.com/)
