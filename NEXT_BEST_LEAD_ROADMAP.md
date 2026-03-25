# Next Best Lead Roadmap (Safe, Non-Disruptive)

## Goal
Increase conversion and speed-to-action on the Today screen without breaking current workflow or adding unnecessary complexity.

## Principles (Non-Negotiable)
- Keep existing SLA/tier guardrails first.
- Introduce one capability at a time behind flags.
- Ship only what measurably improves KPI targets.
- Add no ML component without clear data quality checks.
- Every phase must support instant rollback to current behavior.

## What We Already Have
- v1 scoring + next-best-action hints in Today queue.
- Tier-based prioritization remains intact.
- Basic explainability shown to rep ("why this is next").

## Success KPIs (Primary)
- `Median time-to-first-action` on top-ranked items.
- `Lead contact rate within SLA window`.
- `Appointment set rate` from new inbound leads.
- `Close rate` (7/14/30 day windows).

## Guardrail KPIs (Must Not Regress)
- Rep task completion volume.
- Queue stability (no thrash/reordering every refresh).
- Error rates and page latency on Today.
- User trust metric (manual overrides or "dismiss recommended action" frequency).

---

## Phase 0: Stabilize v1 (1 week)
### Deliver
- Add feature flag: `NEXT_BEST_LEAD_V1`.
- Add telemetry events:
  - lead_shown
  - recommended_action_shown
  - recommended_action_taken
  - override_action_taken
  - outcome_changed (appt_set, sold, lost, dormant)
- Add daily monitoring dashboard for KPI + guardrails.

### Exit Criteria
- No performance regressions on Today.
- Event capture completeness >= 95%.

### Stop/rollback triggers
- Today load latency regresses > 20%.
- Error rate increase > 1.5x baseline.

---

## Phase 1: v1.1 Conversation-Aware Features (2-3 weeks)
### Deliver
- Build async feature extractor from recent customer + rep history.
- Compute per-customer compact features:
  - `intent_score` (0..1)
  - `urgency_score` (0..1)
  - `ghost_risk` (0..1)
  - `best_channel` (`call|sms|email`)
  - `feature_updated_at`
- Use these features in queue scoring (read-only fallback to v1 weights if missing).
- Keep action labels human-readable; no UI complexity increase.

### Data Scope (minimal)
- Last 20 activities per customer (inbound + outbound).
- No full transcript storage expansion unless required.

### Exit Criteria
- +8% improvement in recommended-action acceptance.
- Non-negative impact on close rate trend at 2-week look.

### Stop/rollback triggers
- Feature compute errors > 5%.
- Rep acceptance drops > 10%.

---

## Phase 2: Policy Engine (v1.2) (2 weeks)
### Deliver
- Replace single suggested action with deterministic short sequence policy:
  - example: `call_now -> sms in 20m -> email tomorrow`.
- Policy constrained by compliance + quiet hours + opt-out state.
- Add "policy reason" line in card.

### Exit Criteria
- Faster action execution and reduced idle waiting in queue.
- No compliance or channel-policy violations.

### Stop/rollback triggers
- Any policy violation incidents.
- Increased manual overrides > 15%.

---

## Phase 3: Rep Routing (v1.3) (2-3 weeks)
### Deliver
- Route high-priority leads to best-fit rep using:
  - response speed
  - close rate by source/type
  - active workload
- Keep manual reassignment available.

### Exit Criteria
- Reduced time-to-first-contact on high-priority leads.
- Better conversion for routed leads vs non-routed control.

### Stop/rollback triggers
- Rep workload imbalance above threshold.
- Admin complaints about assignment quality.

---

## Phase 4: Learning Loop + Calibration (v1.4-v1.5) (3-4 weeks)
### Deliver
- Weekly auto-recalibration of weights using observed outcomes.
- Score calibration checks (predicted vs observed).
- A/B framework for ranking policy experiments.

### Exit Criteria
- Stable, calibrated score buckets.
- Consistent KPI improvement over 4+ weeks.

### Stop/rollback triggers
- Volatile score drift week-to-week.
- No measurable lift across 2 consecutive experiments.

---

## Phase 5: Model Upgrade (v2.0+) (only if justified)
### Deliver
- Move to trained models for:
  - `P(contact)`
  - `P(appointment)`
  - `P(close)`
  - delay hazard
- Keep rules as hard constraints.

### Exit Criteria
- Statistically significant lift over v1.x policy.
- Explainability maintained in UI.

### Stop/rollback triggers
- Black-box behavior reducing rep trust.
- Inability to explain top-ranked recommendations.

---

## What We Explicitly Will NOT Build (Yet)
- No fully autonomous outreach.
- No complex GenAI copilots in queue UI.
- No deep personalization features without validated lift.
- No new channels unless they improve core KPI.

---

## Release Safety Checklist (every phase)
- Feature flag default OFF.
- Canary on internal/admin org first.
- Rollout 10% -> 25% -> 50% -> 100%.
- Rollback switch verified before full rollout.
- KPI and guardrail review after each rollout step.

---

## Minimal Tech Backlog
1. Add feature flags and config table.
2. Add event instrumentation for recommendation lifecycle.
3. Add `lead_scoring_features` storage + updater job.
4. Add monitoring dashboard (daily + weekly).
5. Add experiment assignment framework.

---

## Decision Gate Template (use before moving phases)
- Did primary KPI improve?
- Did any guardrail regress?
- Did users adopt recommendations?
- Is maintenance burden still low?
- Do we have evidence for next phase necessity?

If any answer is "no", pause and harden current phase instead of adding features.
