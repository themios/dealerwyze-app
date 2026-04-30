# AI Lead Intelligence Plan — DealerWyze

**Date:** 2026-04-30
**Status:** Approved for development
**Scope:** Replace rule-based lead scoring with a multi-layer AI intelligence system across the Today screen, lead queue, inventory, and daily command center

---

## Cost Management Strategy

### The core problem with "score on every inbound"

Running an LLM call on every inbound message would burn tokens continuously throughout the day with no predictability. A dealership receiving 80 inbound SMS/emails per day could easily generate thousands of API calls per month — most of them re-scoring leads that haven't meaningfully changed.

### The right model: triggered + daily batch hybrid

Split the scoring workload into two tiers by urgency:

#### Tier A — Triggered scoring (real-time, tightly bounded)

Runs only on these high-value events:
- **New lead arrives** (first ingest) — always score immediately; this is the cold-start case
- **Inbound reply on a Tier 1 (Hot/Warm) lead** — customer replied; re-score within 30 seconds
- **Inbound reply after 24h silence** — re-engagement is a strong signal; always worth re-scoring

Hard limits applied per org:
- **Max 1 re-score per customer per 15 minutes** (debounce) — prevents thundering herds on fast-texting customers
- **Max 50 triggered re-scores per org per day** — hard ceiling; beyond this, falls back to batch
- **Max conversation length sent to LLM: 3,000 tokens** (~10 messages) — truncate oldest messages first; only the recent thread matters for current intent

#### Tier B — Daily batch (cron, 5:30am org local time)

Handles everything that can tolerate overnight latency:
- Cold and warm leads that received no inbound activity today (re-rank for tomorrow's queue)
- Inventory intelligence signals (vehicle demand, conversion rates)
- Daily command center briefing generation
- Engagement stat updates (avg reply speed, message counts)
- Stale score cleanup (leads not re-scored in > 72h get a fresh pass)

One scheduled pass per org, per day. Predictable. Can be budget-capped per plan tier.

### Cost estimation

**Primary model: Groq Llama 3.1 70B** — $0.59/M input tokens, $0.79/M output tokens

| Event | Avg tokens (in/out) | Cost per event |
|---|---|---|
| New lead score | 800 / 250 | ~$0.0007 |
| Reply re-score (10 msg thread) | 1,200 / 250 | ~$0.0009 |
| Daily batch (50 leads) | 40,000 / 12,500 | ~$0.033 |
| Daily brief generation | 2,500 / 800 | ~$0.002 |

**Realistic monthly cost per active dealership:**
- 20 new leads/day × 30 days = 600 triggered scores = ~$0.42
- 20 reply re-scores/day × 30 days = 600 triggered = ~$0.54
- 30 daily batch runs = ~$1.00
- 30 daily briefs = ~$0.06
- **Total: ~$2/month per org** at typical volume

At 100 orgs, ~$200/month — well within LLM budget before making it a plan-tier feature.

**Anthropic Claude Haiku** (fallback / long-thread analysis): ~$0.25/M input. Reserve for threads > 3,000 tokens where nuance matters more than speed.

### Budget enforcement

```sql
-- Track usage per org per day
CREATE TABLE ai_usage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id),
  date           DATE NOT NULL,
  event_type     TEXT NOT NULL,  -- 'triggered_score' | 'batch_score' | 'daily_brief' | 'inventory'
  tokens_in      INT NOT NULL DEFAULT 0,
  tokens_out     INT NOT NULL DEFAULT 0,
  model          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ai_usage_log (org_id, date);
```

Before every LLM call, check `SUM(tokens_in + tokens_out)` for this org today. If it exceeds the plan-tier cap, skip and log. No silent overruns.

**Plan tiers (suggested):**
- Free / trial: batch only, no triggered scoring, no daily brief
- Starter: triggered scoring up to 20/day, daily brief
- Pro: triggered scoring up to 50/day, full intelligence suite
- Enterprise: configurable cap, org-learning enabled

### Staleness handling

If a lead's `lead_intent_scored_at` is older than 72 hours and no re-score job has run, the Today card falls back to the keyword rule engine and shows no intent tier badge. No stale score is worse than no score — it just means the old rules apply until the batch catches up.

---

## Problem Statement

The current lead prioritization system in `lib/today/queueSort.ts` is a deterministic rule engine. It scores leads based on:

- Activity type (email, SMS, appointment, etc.)
- Lead age / freshness decay over 180 minutes
- Keyword matching on the initial lead body (11 phrases)
- Whether the customer has a phone number on file

This means two leads with identical rule scores could be:

- **(A)** Someone who replied "I have cash and want to come in today, what's your best price?" with a trade-in
- **(B)** Someone who said "just looking" in their original inquiry and has gone silent for 3 days

The system treats them the same. It never re-scores when the customer replies. It ignores conversation history, engagement velocity, re-inquiry patterns, pipeline stage, inventory demand, and outcome history.

The goal is to replace this with an **action-based AI operating system** — not a dashboard that summarizes data, but a system that tells the dealer what to do next and why.

---

## Design Principles

1. **Action-first, not analytics-first.** Every AI output should map to a dealer action: call, text, send financing link, drop price, move to hot. Summaries alone are not valuable.
2. **Score asynchronously, read cheaply.** No LLM calls at Today page render time. Score on ingest and on each inbound reply, store on the customer record, read at render.
3. **Show the reasoning.** Dealers should see 2-3 plain-English signals for why a lead is ranked #1. Not just a colored badge.
4. **Start with the data we have.** The customer record already has `lead_intent_score`, `lead_intent_tier`, `lead_intent_flags`, `lead_intent_summary`. The foundation exists. Enrich it rather than replace it.
5. **Org-specific learning.** Signals that correlate with closed deals at *this* dealership should be weighted higher than generic industry patterns.

---

## Intelligence Layers

### Layer 1 — Conversation Intelligence (highest impact)

**What it does:** Every inbound reply triggers a re-score of the full conversation thread using an LLM. Not keyword matching — structured extraction of buyer intent.

**Signals extracted:**
- Sentiment trajectory (getting warmer or cooler across messages?)
- Explicit buying signals: price request, financing question, specific vehicle ask, timeline set
- Objections surfaced: "too expensive", "still shopping", "spouse needs to approve"
- Competitive mentions: "ABC Auto offered me X", "I found one at CarMax"
- Urgency language: "need it before the weekend", "my car just broke down", "end of month"
- Channel preference implied: called in vs. texted vs. emailed (informs Next Best Action)

**Output stored on `customers`:**
```
lead_intent_score       FLOAT      (0.0 – 1.0)
lead_intent_tier        TEXT       ('hot' | 'warm' | 'cold' | 'dead')
lead_intent_flags       TEXT[]     (['financing_interest', 'trade_in', 'urgency_signal', ...])
lead_intent_summary     TEXT       (2–3 plain-English sentences)
lead_intent_scored_at   TIMESTAMPTZ
```

**When it runs:**
- On first lead ingest (already partially wired in `lib/leads/intent.ts`)
- On every inbound reply (SMS, email) from a customer — trigger re-score of last 10 messages
- Async background job — not blocking the ingest or webhook response

**Stack:** Groq (Llama 3.1 70B) as primary — fast (<1s), cheap, already integrated. Anthropic Claude Haiku as fallback for long threads.

---

### Layer 2 — Customer Engagement Signals

**What it does:** Track behavioral patterns that predict conversion, beyond the initial message.

**Signals tracked per customer:**
- `avg_reply_speed_minutes` — how fast they historically respond (fast responder = high intent)
- `inbound_message_count` — total inbound messages in this inquiry thread
- `is_reinquiry` — submitted more than once (re-inquiries are 2–3x higher conversion)
- `last_inbound_at` — when they last contacted us (separate from lead created_at)
- `days_in_current_stage` — how long in current pipeline stage vs. org average
- `prior_purchase_count` — returning customer? Highest priority tier.

**How these feed the queue:**
- Re-inquiry flag: `+0.25` boost to `winLikelihood`
- Fast responder (< 10 min avg): `+0.15` boost
- Prior customer: forces into Tier 1 regardless of activity type
- Thread depth (> 4 messages): `+0.10` boost — they're engaged

---

### Layer 3 — Lead Tier Classification

Explicit hot/warm/cold buckets replacing the implicit scoring. Used for visual labels on Today cards and for filtering.

**Hot** (call within 5 minutes):
- Re-inquiry / repeat lead on same vehicle
- Mentioned appointment, test drive, "come in today"
- Mentioned down payment, financing, trade-in
- Inbound phone call
- Reply within 10 minutes of outbound

**Warm** (call or text within 2 hours):
- Has phone + email + specific vehicle interest
- Engaged in back-and-forth thread (3+ messages)
- Mentioned timeline in the next 2 weeks

**Cold** (sequence follow-up, no rush):
- No phone number
- Generic inquiry, no vehicle specified
- Far ZIP code, no financing signals
- One-message inquiry, no reply in 24h

**Dead** (auto-archive candidate):
- No reply after 3 outbound attempts over 7 days
- Bounced email + disconnected phone
- Explicit disinterest expressed

---

### Layer 4 — Inventory Intelligence

**What it does:** Analyzes lead volume, appointment conversion rate, and response patterns by vehicle, to surface demand signals the dealer can act on.

**Signals tracked per vehicle:**
- Lead count (last 7 / 30 days)
- Appointment conversion rate (leads → appointments)
- Avg intent score across all leads for that vehicle
- Common objections surfaced in conversations
- Avg days on lot vs. leads generated (low leads + long lot time = price drop signal)

**Outputs:**
- "2024 HR-V has 18 leads in 10 days but 8% appointment conversion — buyers may need financing workflow."
- "2005 Tundra: fewer leads but avg intent score 0.82 — truck buyers are highly motivated."
- "This Civic has 42 views but zero leads — listing copy or photos may be the issue."

**Action signals:**
- `needs_price_drop`: high days-on-lot + declining lead rate + low conversion
- `needs_financing_push`: high intent leads + high objection rate on price
- `high_demand`: accelerating lead volume → promote it, source similar units
- `buy_signal`: similar vehicles are generating strong intent → acquisition recommendation

---

### Layer 5 — Daily Sales Command Center

Replaces the current static motivational message with an AI-generated morning briefing rendered in the DealerBrief component.

**Generated every morning at 6am (cron), stored as text, rendered instantly:**

```
TOP 5 CALLS FOR TODAY
1. Joel Alvarez — 3rd inquiry on the Tundra. Has not spoken to anyone yet. Call now.
2. Maria Santos — Replied "yes I want to come in" 2 days ago. No appointment set.
3. David Chen — Asked about financing twice. No credit app sent.
4. ...

VEHICLES TO WATCH
• HR-V: 18 leads, only 2 appointments. Your response time on HR-V leads is 4.2 hours avg.
• Tundra: Strong intent signals across 3 recent leads. Only 1 left in inventory.

LEADS AT RISK
• 6 leads with no follow-up after 48 hours
• 2 appointments with no confirmation sent (risk of no-show)

RESPONSE TIME
Your avg first-response time this week: 3.1 hours. Industry benchmark: 5 minutes.
Estimated appointments lost to slow response: 4
```

---

### Layer 6 — Lost Lead Analysis (Automated)

**What it identifies:**
- No response sent after inbound lead (>1 hour with no outbound)
- Thread ended with no appointment set (> 5 messages, no appt activity created)
- Appointment set but no confirmation sent within 24h
- Customer asked about financing but no financing link or credit app activity followed
- Re-inquiry from a customer with no human call in history (only auto-responses)
- No-show risk: appointment within 24h, zero confirmation or reminder sent

**Output:** Surfaces in Today screen as "At Risk" section. Each item has a one-click action: call, send link, confirm, reassign.

---

## How queueSort.ts Changes

### Current

```
intentSignal(text) → keyword scan on initial body
contactabilitySignal(data) → has phone / email
freshness → age decay from created_at
winLikelihood = formula of above
```

### Target

```
storedIntentScore → lead_intent_score from customer record (LLM-scored, updated on each reply)
engagementSignal → reply speed, thread depth, re-inquiry flag, prior customer
freshness → still applies for leads not yet scored (<2 min old)
vehicleDemandScore → inventory-level signal for this vehicle
winLikelihood = (0.35 × storedIntentScore) + (0.25 × engagementSignal) + (0.20 × freshness) + (0.20 × vehicleDemandScore)
```

Keyword fallback remains for leads too fresh to have been LLM-scored yet (< 2 minutes old).

---

## Today Card Rendering — Visible Reasons

The `QueueDecision.reasons[]` array already exists in the data model and is never rendered.

**Target rendering on each Today card (below the customer name):**

```
🔥 HOT  ·  Call now
━━━━━━━━━━━━━━━━━━━
Joel Alvarez  ·  2005 Tundra
"I can come in this Saturday, what's your best cash price?"

▸ 3rd inquiry on this vehicle
▸ Mentioned cash purchase + timeline
▸ No human call in history — only auto-reply sent
```

Not a tooltip. Not hidden. Always visible for Tier 1 leads.

---

## Implementation Phases

### Phase A — Conversation Re-Scorer (highest leverage, ~3 days)

**Goal:** Make the score update when customers reply, not just on first ingest.

1. Create `lib/leads/conversationScore.ts`
   - Accepts customer_id + org_id
   - Fetches last 10 activities for that customer (inbound + outbound)
   - Formats as a conversation transcript
   - Calls Groq with a structured extraction prompt
   - Returns: `{ score, tier, flags, summary }`

2. Wire re-scorer into inbound SMS webhook (`app/api/twilio/inbound/route.ts`)
   - After storing the inbound message, fire async re-score
   - Non-blocking — use `void` call or edge runtime background fetch

3. Wire re-scorer into Gmail inbound webhook (`lib/gmail/pushWebhook.ts`)
   - Same pattern

4. Update `lib/leads/intent.ts` `deriveLeadIntentFromLead()` to use the new scorer on first ingest

5. Update `queueSort.ts` to read `lead_intent_score` from the activity's joined customer record
   - Already selected: `safeNewLeads` joins `customers` with intent fields
   - Replace inline `intentSignal()` with stored score when available

6. Render `decision.reasons` on `NewLeadCard` and `WaitingItem`

**Success:** A customer who replies "ready to buy" moves to the top of the queue within seconds.

---

### Phase B — Engagement Signals (3-4 days)

**Goal:** Score customers on behavior, not just conversation content.

1. Migration: add `avg_reply_speed_minutes`, `inbound_message_count`, `last_inbound_at`, `prior_purchase_count` to `customers`

2. Update ingest to set `is_reinquiry` boost (already detected in `lib/leads/reinquiry.ts`, not surfaced to queue)

3. Update `queueSort.ts` to read engagement fields and apply multipliers

4. Add "Repeat Lead" badge on Today cards for re-inquiries — make it prominent

**Success:** Joel Alvarez submitting his 3rd inquiry on the Tundra surfaces as #1 with "Repeat lead. High intent. Call now."

---

### Phase C — Lead Tier Labels + Today Card Upgrade (2 days)

**Goal:** Surface intent tier visually and replace static reasons with LLM-generated ones.

1. Add intent tier badge (`HOT` / `WARM` / `COLD`) to Today cards — displayed next to the tier label
2. Show top 2 `reasons` strings inline on each card (already in `QueueDecision.reasons`)
3. Add `nextBestAction` as a visual CTA label ("Call now" / "Send financing link" / "Confirm appointment")
4. Add "At Risk" section to Today screen for leads matching lost-lead patterns

**Success:** Reps see at a glance why each lead is ranked where it is, and what to do next.

---

### Phase D — Daily Command Center (3-4 days)

**Goal:** Generate the morning AI briefing and render it in DealerBrief.

1. Create cron job `lib/cron/jobs/dailyIntelligence.ts`
   - Runs at 6am per org timezone
   - Generates top-5 call list, vehicle signals, response time stats, at-risk leads
   - Calls Anthropic to generate the narrative briefing text
   - Stores result in `org_settings.daily_brief_json` (or a new `daily_briefs` table)

2. Update `DealerBriefClient` to render the structured brief sections
   - Top 5 calls (with customer name, signal reason, one-click call)
   - Vehicle demand signals
   - Response time vs. benchmark
   - At-risk count with link to filtered view

**Success:** Dealer opens the app at 8am and immediately knows the 5 people to call and which car to discount.

---

### Phase E — Inventory Intelligence (4-5 days)

**Goal:** Surface per-vehicle demand signals and recommendations.

1. Build `lib/intelligence/vehicleSignals.ts`
   - Aggregates leads by vehicle_id (last 30 days)
   - Computes: lead count, avg intent score, appointment conversion rate, common flags
   - Flags: `needs_price_drop`, `needs_financing_push`, `high_demand`, `buy_signal`

2. Cron to update `vehicles` table with signal fields (run nightly)

3. Add inventory intelligence section to DealerBrief
   - "Top 3 vehicles by demand this week"
   - "2 vehicles with stale demand — consider price drop"
   - "Buy signal: Civic/Corolla-type demand is up 40%"

4. Show vehicle signal badge on vehicle detail page and pipeline cards

**Success:** Dealer can make stocking and pricing decisions based on actual lead intelligence, not gut feel.

---

### Phase F — Org-Level Learning (1-2 weeks, deferred)

**Goal:** Weight signals by what actually converts at this dealership.

1. Outcome tagging: when a deal closes, record which intent flags + tier were present at first contact
2. Weekly cron: compute per-org conversion rate by tier, flag, lead source, vehicle type
3. Adjust `winLikelihood` weights based on org-specific conversion table
4. Surface "Your best lead sources this month" in DealerBrief

---

## Data Model Changes

### customers table (additions)

```sql
avg_reply_speed_minutes  FLOAT
inbound_message_count    INT DEFAULT 0
last_inbound_at          TIMESTAMPTZ
prior_purchase_count     INT DEFAULT 0
lead_intent_scored_at    TIMESTAMPTZ   -- already exists, ensure populated
```

### vehicles table (additions)

```sql
lead_count_30d           INT DEFAULT 0
appt_conversion_rate     FLOAT
avg_intent_score         FLOAT
demand_signal            TEXT   -- 'high_demand' | 'needs_price_drop' | 'needs_financing_push' | 'buy_signal' | null
demand_updated_at        TIMESTAMPTZ
```

### daily_briefs table (new)

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
org_id         UUID NOT NULL REFERENCES organizations(id)
date           DATE NOT NULL
brief_json     JSONB NOT NULL   -- structured data for rendering
narrative      TEXT             -- LLM-generated narrative text
generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (org_id, date)
```

---

## LLM Prompt Design (Conversation Re-Scorer)

```
You are a lead scoring assistant for a used-car dealership CRM.

Analyze this customer conversation and return a JSON object.

CONVERSATION:
[dealer]: {outbound messages}
[customer]: {inbound messages}

Return JSON with these exact fields:
{
  "score": 0.0-1.0,              // overall purchase likelihood
  "tier": "hot|warm|cold|dead",
  "flags": [],                   // from: ["financing_interest","trade_in","appointment_request",
                                 //        "urgency_signal","price_sensitive","competitive_mention",
                                 //        "repeat_inquiry","cash_buyer","returning_customer",
                                 //        "reliability_concern","specific_vehicle","general_inquiry"]
  "summary": "2-3 sentence plain English summary of buyer intent and recommended action",
  "next_best_action": "call_now|text_now|send_financing_link|confirm_appointment|send_followup|wait"
}

Rules:
- score >= 0.75 = hot (call within 5 min)
- score 0.45-0.74 = warm (contact within 2h)
- score 0.20-0.44 = cold (sequence follow-up)
- score < 0.20 = dead (archive candidate)
- Mentions of appointment/test drive/come in = always hot
- No phone number + generic inquiry = cold regardless of other signals
- Re-inquiry on same vehicle = boost score by 0.20
```

---

## Success Criteria

### Correctness
- A customer who replies "I'm ready to buy" moves to the top of the Tier 1 queue within 30 seconds of their message arriving
- Repeat leads (same customer, 2+ inquiries) always surface with a "Repeat Lead" badge and forced Tier 1 placement
- Today cards show 2-3 plain-English reasons why each lead is ranked where it is
- The daily briefing correctly identifies the top 5 calls each morning, verified by manual review for 2 weeks
- Regression test suite passes on gold-labeled conversation set (Phase A gate before production)
- Score distribution does not drift to > 70% "warm" within any 7-day window

### Reliability
- No inbound webhook failure caused by LLM scoring error (scoring is always non-blocking)
- Thundering herd: 10 rapid inbound messages from same customer → exactly 1 re-score job runs
- Budget cap enforced: no org exceeds daily token limit without explicit plan upgrade

### Cost
- Monthly AI cost per active org stays below $5 at typical volume (< 100 inbound messages/day)
- `ai_usage_log` shows no runaway orgs within first 30 days

### Leading indicators (before Phase F)
- Time-to-first-human-contact for HOT tier leads: tracked and reportable from day 1
- % of HOT leads contacted within 15 minutes: target > 60% within 60 days
- Tier distribution per org per week: visible in admin panel for drift monitoring
- Correlation of tier-at-first-contact with appointment set (measurable at 90 days)

### Qualitative
- Inventory demand signals correctly flag vehicles that subsequently get price drops or sell quickly
- Response time stat in DealerBrief matches manually calculated response time within 10% (excluding weekends)
- Dealers report using the visible reasons to decide who to call first (qualitative validation at 30 days)

---

## What This Is Not

- Not a pretty analytics dashboard
- Not a feature that requires dealers to learn a new workflow
- Not an AI chatbot or auto-responder enhancement
- Not a prediction model that replaces dealer judgment

It is an **AI manager embedded in the existing Today screen** that surfaces the right action, at the right time, for the right lead, with visible reasoning.

---

## Operational Hardening

These are production requirements, not nice-to-haves. They must be built in Phase A, not added later.

### Idempotency and thundering herds

A customer sends 3 SMS messages in 60 seconds. Without protection, 3 concurrent re-score jobs run simultaneously, all read the same conversation, all write conflicting scores.

Mitigation:
- **15-minute debounce per customer**: before queuing a re-score job, check `lead_intent_scored_at`. If it was updated in the last 15 minutes, skip.
- **Single-flight lock**: use a DB row lock (`SELECT ... FOR UPDATE SKIP LOCKED` on a `scoring_jobs` table) or Upstash Redis lock with a 60-second TTL before calling the LLM.
- **Idempotent write**: include an `input_hash` (sha256 of the transcript sent to the model). If the hash matches the stored `lead_intent_input_hash`, skip the DB write — same input produces the same output.

### Failure and retry

LLM APIs fail. Groq has occasional 429s and 503s.

Mitigation:
- Triggered scoring: catch failure, log to `ai_usage_log` with `event_type = 'score_error'`, fall back silently to existing score — never crash the inbound webhook
- Batch scoring: retry failed customers on the next nightly run (no immediate retry loop)
- After 3 consecutive failures for the same customer, mark `lead_intent_score_error = true` on the customer row and surface a soft indicator on the Today card ("Scoring unavailable")
- Dead-letter logging: all LLM errors write to a structured log with org_id, customer_id, model, error code — reviewable from the admin panel

### Score vs. tier conflict resolution

The LLM prompt returns both a numeric score (0.0–1.0) and a tier string. Override rules apply **after** the model returns, in code:

```typescript
// lib/leads/conversationScore.ts — normalizeResult()
if (flags.includes('appointment_request') || flags.includes('test_drive')) tier = 'hot'
if (!hasPhone && !hasEmail) tier = Math.min(score, 'cold')  // contactless = never hot
if (is_reinquiry) score = Math.min(1.0, score + 0.20)
// tier is always derived from final score after overrides:
tier = score >= 0.75 ? 'hot' : score >= 0.45 ? 'warm' : score >= 0.20 ? 'cold' : 'dead'
```

The model's returned tier string is advisory. Code always derives final tier from the adjusted score.

### Human override and audit

Reps will disagree with model output. That's correct — they have context the model doesn't.

- Manual tier bump: rep can override tier on any lead card (hot/warm/cold/ignore). Stored as `lead_intent_manual_tier` on the customer row.
- Manual note: `lead_intent_manual_note` field (already in type definitions) captures why.
- Queue always uses `lead_intent_manual_tier` if set, ignoring the model score.
- Audit: every manual override writes to `org_audit_log` (already built) with `event = 'lead_tier_override'`, `actor_id`, old tier, new tier.
- Manual overrides persist for 7 days, then expire back to model scoring — prevents stale human overrides from permanently suppressing hot re-inquiries.

### Evaluation and calibration (before Phase F, not after)

Before org-level learning, build a lightweight evaluation layer:

1. **Gold set**: 20–30 manually labeled conversation transcripts per org (or a shared eval set at product level). These are labeled with expected tier and top 2 flags.
2. **Regression test**: `lib/__tests__/conversationScore.eval.ts` — fixed transcripts → expected tier bounds. Fails CI if the scorer regresses on any labeled example.
3. **Drift monitoring**: weekly cron checks distribution of tiers per org. If > 70% of leads are scoring "warm" (the most common drift direction), alert and log. A model that says everything is warm is useless.

### Inventory — fuzzy vehicle matching

Many leads won't resolve cleanly to a `vehicle_id`. The lead says "2005 Tundra" but the vehicle record is `id = abc123`. Direct join will miss most leads.

Two paths:
- **Structured match**: if the ingest parser extracted `year + make + model`, match against `vehicles` table on those three fields. Create `vehicle_lead_count` aggregate keyed on YMM string, not vehicle_id.
- **Unresolved path**: leads with no vehicle match contribute to a `vehicle_interest_string` aggregate ("2005 Tundra" → 4 mentions). This feeds inventory demand signals independently of whether a matching vehicle is in stock.

Never silently drop a lead from inventory aggregation just because no vehicle_id resolved.

### Compliance and messaging gating

`next_best_action = 'text_now'` must never trigger automated SMS. It is a recommendation to the rep, not an automation trigger. The existing SMS opt-out and consent checks (`sms_opt_out`, `unsubscribe_sms`) gate all outbound messaging and are not bypassed by AI recommendations.

If a rep acts on "text now" and the customer has `sms_opt_out = true`, the normal SMS send path rejects it — the AI layer adds no new risk here. But document this clearly so future developers don't wire `next_best_action` directly to auto-send.

### Security and tenancy

Every background scoring job and batch cron must derive `org_id` from the customer row or a server-validated job payload — never from client input. This matches the existing CLAUDE.md policy. Any code that reads `customer_id` from a job queue must validate that the customer's `user_id` matches the job's `org_id` before calling the LLM or writing results.

### Response time benchmarks

The plan references "industry benchmark: 5 minutes." Use the org's own trailing 30-day average as the primary benchmark, labeled as such. Industry figures are illustrative — show them as context, never as a score. Weekends and holidays should be excluded from SLA calculations (or the org should be able to configure business hours for response time tracking).

---

## References

- `lib/today/queueSort.ts` — current scoring engine to be enhanced
- `lib/leads/intent.ts` — existing intent derivation (to be replaced by conversationScore)
- `lib/leads/ingest.ts` — trigger point for first-ingest scoring
- `app/api/twilio/inbound/route.ts` — trigger point for reply re-scoring
- `lib/gmail/pushWebhook.ts` — trigger point for Gmail reply re-scoring
- `components/today/DealerBriefClient.tsx` — rendering target for daily command center
- `lib/leads/reinquiry.ts` — re-inquiry detection (already built, not surfaced to queue)
