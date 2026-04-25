# Customer Pulse — Design Spec
**Date:** 2026-04-23
**Status:** Approved for implementation

---

## Overview

Customer Pulse is a closed-loop customer feedback system built into DealerWyze. Customers rate their experience across every touchpoint after a sale or dealer-triggered event. Dealers use the data to develop people, improve processes, and track progress over time using a PDCA framework. DealerWyze uses aggregated signals to benchmark dealers and improve the platform.

**Guiding principle:** Every piece of feedback is a gift. The system treats it that way — from the thank-you message the customer receives, to the way scores are surfaced to reps without shame.

---

## Three Layers

1. **Customer layer** — mobile-first survey sent via SMS/email link, adaptive depth, always respectful
2. **Dealer layer** — dashboard + PDCA action board + per-rep coaching view + manager escalation
3. **Platform layer** — anonymized benchmarks, proactive nudges, product roadmap signal

---

## Layer 1: Customer Survey Experience

### Delivery
- Triggered automatically when deal marked sold, OR manually by dealer at any time
- Post-sale auto-triggers: immediately on sold, 30 days after, 6 months after
- Delivered via SMS and/or email
- URL: `dealerwyze.com/pulse/[token]` — unique per customer per survey event
- No login required. Token expires in 30 days.
- Public route, no auth middleware

### Opening Screen
Warm, personal message explaining the importance of their feedback. Customer chooses depth upfront:
- **Quick** (60 sec) — 5 core questions, emoji scale
- **Standard** (2-3 min) — all categories, star ratings
- **Full** (4-5 min) — all categories + open comments per section + recommendations

### 360 Survey Categories

| Area | Questions |
|------|-----------|
| **First Contact** | Response speed, felt welcomed |
| **Your Rep** | Communication, knowledge, pressure level |
| **The Vehicle** | Condition vs. expectation, cleanliness, listing accuracy |
| **The Process** | Ease of buying, paperwork speed, financing clarity |
| **The Facility** | Cleanliness, comfort, wait experience |
| **Post-Sale** | Follow-up quality, would refer, would buy again |
| **Open Rec** | "One thing we could do better" (always optional) |

**Adaptive logic:** Any category scoring 3 or below automatically expands to show 1-2 follow-up questions.

### Closing Screen
Thank-you message assuring customer they have been heard. Feedback goes directly to management (not public).

Final prompt: "Would you like someone to follow up with you?" — Yes/No. If Yes, creates a priority task for dealer_admin/dealer_manager.

---

## Layer 2: Dealer Dashboard

### Routing
- All feedback routed to dealer_admin and dealer_manager only (may be employee-related)
- dealer_rep sees only their own anonymous feedback via Today page score widget
- dealer_rep never sees customer names on their own feedback

### Dashboard (`/pulse`)
- Overall Pulse Score (rolling 90-day average)
- Score by category with trend lines
- Recent responses list (manager view includes customer name)
- Filter by: rep, date range, trigger type, score range

### PDCA Action Board
Scores feed into a Plan-Do-Check-Act board:
- **Plan** — manager logs an improvement action linked to a low-scoring category
- **Do** — action assigned to team member with due date, tracked as a task
- **Check** — system compares scores before/after action period
- **Act** — manager marks what worked as a "standard practice"

### Per-Rep Coaching View
- Scores linked to the rep named in the deal
- Manager sees per-rep breakdown across all categories
- Used for 1:1 coaching conversations backed by data, not opinion

### Today Page Widget (Per-Rep)
- Each rep sees their personal Pulse Score on the Today page
- Clicking the score opens a sheet with their anonymous feedback (no customer names)
- Score updates rolling 90 days
- Color-coded: green 4.5+, yellow 3.5-4.4, red below 3.5

### Escalation Workflow
- Customer requests follow-up → priority task created, assigned to dealer_admin
- Low score (any category 2 or below) → admin_alert created for dealer_admin
- Manager logs resolution on the task to close the loop

---

## Layer 3: Platform Intelligence

### Aggregated Benchmarks
- DealerWyze aggregates anonymized scores across all dealers
- Dealers see how they rank vs. peers (percentile, not raw scores)
- Published best practice guides generated from top-quartile dealer patterns

### Proactive Nudges
- When a dealer's score drops in a category, system surfaces a relevant tip or unused feature
- Example: low "response time" score → "Have you set up your 60-second autoresponder?"
- Nudges appear on Today page and in weekly Dealer Brief email

### Product Roadmap Signal
- Aggregated weak spots across all dealers feed into DealerWyze feature prioritization
- Internal admin view shows category score distribution across all orgs
- Drives quarterly roadmap decisions

---

## Data Model

### New Tables
```sql
-- One survey event per customer per trigger
pulse_surveys (
  id, org_id, customer_id, assigned_rep_id,
  trigger_type (sold | manual | day30 | day180),
  token (unique, used in public URL),
  sent_at, opened_at, completed_at, expires_at,
  depth_chosen (quick | standard | full),
  wants_followup (bool),
  overall_score (computed avg),
  created_at
)

-- One row per category per survey
pulse_responses (
  id, survey_id, org_id,
  category (first_contact | rep | vehicle | process | facility | post_sale),
  question_key,
  score (1-5),
  comment (text, nullable),
  created_at
)

-- PDCA actions
pulse_actions (
  id, org_id, category,
  plan_text, assigned_to, due_at,
  status (plan | doing | checking | standardized),
  score_before, score_after,
  created_at, updated_at
)
```

### Existing Table Changes
- `org_settings`: add `pulse_enabled (bool)`, `pulse_auto_send_on_sold (bool)`, `pulse_send_day30 (bool)`, `pulse_send_day180 (bool)`
- `profiles`: add `pulse_score (float)`, `pulse_score_updated_at`

---

## Public Routes
- `GET /pulse/[token]` — customer survey page (no auth)
- `POST /api/pulse/[token]/respond` — submit responses (no auth, token-validated)

## App Routes
- `/pulse` — dealer dashboard (dealer_admin + dealer_manager)
- `/pulse/actions` — PDCA action board
- `/pulse/team` — per-rep coaching view
- Settings → Customer Pulse — enable/disable, configure auto-triggers

---

## Implementation Approach
Option B: Feedback Module — ships as a named feature in incremental layers:
1. Survey delivery + public response page
2. Dealer dashboard (scores + responses)
3. PDCA action board
4. Per-rep Today widget
5. Platform benchmarks + nudges

---

## Out of Scope (this version)
- Public reviews or Google Review integration
- Customer-facing history portal
- AI-generated coaching scripts (future)
- Video/photo feedback
