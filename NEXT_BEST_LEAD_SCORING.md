# Next Best Lead Scoring (Today Screen)

## Objective
Give reps one clear next action with minimal thinking:

- Keep hard SLA/tier guardrails.
- Rank within each tier by expected conversion impact and delay risk.
- Show plain-English reason + suggested action.

## Live v1 implementation
Implemented in:

- `lib/today/queueSort.ts`
- `app/(app)/today/TodayContent.tsx`

### v1 score shape

`PriorityScore = TierBase + WinLikelihood * 220 + DelayRisk * 180 + Intent * 90 + Contactability * 50 + RepliedBoost`

Where:

- `TierBase` keeps non-negotiable queue policy (new inbound first, then missed/appt, overdue, due today, waiting).
- `WinLikelihood` is a bounded estimate from freshness, intent cues, channel availability, and reply recency.
- `DelayRisk` rises with lead age, overdue duration, and near-term due windows.
- `Intent` comes from keyword cues in lead/call text (`appointment`, `test drive`, `finance`, `trade-in`, etc.).
- `Contactability` rewards available phone/email channels.
- `RepliedBoost` increases priority when customer has replied recently.

### v1 next-best-action routing

Per card, system recommends one action:

- `call_now`
- `text_now`
- `send_email`
- `confirm_appointment`
- `send_followup`
- `review_reply`
- `wait`

Displayed in Today as:

- Top “Do This Now” panel (single recommended action).
- Per-card rank row with action and primary reason.

## v2: AI conversation understanding

Use AI on recent customer + rep history to replace keyword-only intent with richer inferred signals:

- Buyer intent stage (researching / comparing / ready-to-buy).
- Objection class (price, financing, trade-in, trust, logistics).
- Urgency horizon (today / this week / later).
- Sentiment and tone drift.
- Likelihood of ghosting if no response in N hours.
- Best channel + message style recommendation.

### Proposed v2 feature payload per customer

Store a compact scored summary (not full transcript) for ranking:

- `intent_score` (0-1)
- `urgency_score` (0-1)
- `objection_score` (0-1)
- `ghost_risk` (0-1)
- `channel_pref` (`call|sms|email`)
- `recommended_talk_track` (short text)
- `updated_at`

### v2 operating model

1. Generate features asynchronously on activity change (new inbound/outbound).
2. Cache features by customer with TTL.
3. Use these features in `buildQueue` scoring.
4. Keep hard guardrails to prevent model mistakes from violating SLA/compliance.
5. Audit outcomes weekly and recalibrate score weights.
