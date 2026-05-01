# Today Command Center — Full Execution Plan

**Product principle:** Today shows only what a human should do next — and why — everything else is either automated, parked, or one tap away.

**Status:** Planning complete. Not started.

---

## Architecture Overview

### UX Model
- **Sections** are primary (answer: "what kind of work is this?")
- **Filters** are secondary overlays (answer: "show me the valuable subset")
- **One canonical section per lead** — waterfall assignment, multiple badges on card
- **Actions re-home leads** — Today feels like a board you clear, not a list you scroll

### Section Structure
```
┌──────────────────────────────────────────────────────────────┐
│  Summary strip: N need you · N automated · N quiet           │
└──────────────────────────────────────────────────────────────┘

[Filters: Hot · Repeat · Appointment · Phone Only · Silent 7+]

▼ Replied / Take Over          (N)    ← default open
▼ Human Now                    (N)    ← default open
▶ AI Is Handling               (N)    ← default collapsed
▶ Follow Up Later              (N)    ← default collapsed
▶ Low ROI / Stop Chasing       (N)    ← default collapsed
```

### Waterfall Assignment (deterministic, no AI cost)
```
1. Inbound reply pending + no outbound response  → Replied / Take Over
2. Appointment request pending                   → Human Now
3. Hot/Warm intent + no active sequence          → Human Now
4. Takeover exception fired (Phase 2)            → Replied / Take Over
5. Active sequence + no exception                → AI Is Handling
6. Snoozed / parked by rep action               → Follow Up Later
7. Ghost pattern OR cold intent OR low ROI       → Low ROI / Stop Chasing
```

### Action → Re-home Map
| Action taken | Moves to |
|---|---|
| Sent reply | Follow Up Later (waiting on customer) |
| Enrolled in sequence | AI Is Handling |
| Snoozed to date | Follow Up Later (with wake time) |
| Took over from sequence | Human Now |
| Marked low ROI / stop | Low ROI → archive eligible |
| Appointment booked | Exits Today, enters appointment workflow |
| Archived | Removed from Today entirely |

---

## Phase 1 — Sections, Classifier, Autoresponder Suppression
**Goal:** Replace flat queue with 5 collapsible sections. Zero new AI cost.
**Status:** [ ] Not started

### 1.1 — Waterfall classifier in queueSort.ts
**Files:** `lib/today/queueSort.ts`

- [ ] Add `TodaySection` type: `'replied' | 'human_now' | 'ai_handling' | 'follow_up_later' | 'low_roi'`
- [ ] Add `sectionAssignment(item, sequenceStatusMap): TodaySection` — pure function, no side effects
- [ ] Rules (in priority order):
  - `replied`: last activity direction = inbound AND no outbound response since AND `completed_at` null
  - `human_now`: appt request type OR (intent hot/warm AND no active sequence)
  - `ai_handling`: `sequenceStatusMap[customerId]` is active AND no exception
  - `follow_up_later`: `snoozed_until` in future OR `today_park` flag set
  - `low_roi`: ghost pattern (N outbound, no inbound in Y days) OR cold intent + low score
- [ ] Add `repAttentionScore(item): number` — blend of priorityScore + recency + intent + automation load
  - Used to rank within each section, not across sections
- [ ] Export section counts alongside queue
- [ ] Unit tests: `lib/__tests__/todayClassifier.test.ts`
  - Test each waterfall rule fires correctly
  - Test priority order (replied beats human_now beats ai_handling)
  - Test edge cases: sequence active + inbound reply → replied (not ai_handling)
  - Test ghost detection thresholds

**Security:** Pure computation, no DB access, no auth surface. No security concerns.

### 1.2 — Section data model + server-side park/snooze actions
**Files:** `supabase/migrations/119_today_lead_state.sql`, `app/api/today/action/route.ts`

- [ ] Migration 119: add `today_section_override` and `today_park_until` columns to `activities`
  ```sql
  ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS today_section_override TEXT
      CHECK (today_section_override IN ('follow_up_later', 'low_roi', NULL)),
    ADD COLUMN IF NOT EXISTS today_park_until TIMESTAMPTZ;
  ```
- [ ] New route: `POST /api/today/action`
  - Auth: `requireProfile()` — no exceptions
  - Body: `{ activityId, action: 'park' | 'trust_sequence' | 'low_roi' | 'snooze', snoozedUntil?: string }`
  - Validate `action` is one of the enum values (Zod)
  - Validate `snoozedUntil` is a future ISO date when action = snooze
  - Fetch activity, assert `activity.user_id = profile.org_id` before mutating (tenant isolation)
  - Write `today_section_override` or `today_park_until` accordingly
  - Return `{ ok: true, section: newSection }`
  - Rate limit: 60 actions/min/org (abuse guard)
- [ ] Wake logic: cron or query-time — if `today_park_until < now()`, clear override and re-classify
- [ ] Security audit:
  - [ ] `user_id` ownership verified before every mutation
  - [ ] No raw activityId trusted from client without DB ownership check
  - [ ] Zod validation on all inputs
  - [ ] Rate limit on action endpoint

### 1.3 — TodaySummaryStrip component
**Files:** `components/today/TodaySummaryStrip.tsx`

- [ ] Shows three counts: "N need you · N automated · N quiet"
- [ ] Counts derived from section assignments, not separate DB query
- [ ] Clicking a count scrolls to that section
- [ ] No PII displayed in strip
- [ ] Skeleton state while data loads

### 1.4 — TodayFilterChips component
**Files:** `components/today/TodayFilterChips.tsx`

- [ ] Filter options: Hot · Warm · Repeat Buyer · Has Appointment · Phone Only · Silent 7+ Days · No Automation
- [ ] Filters applied client-side to already-classified queue (no new DB calls)
- [ ] URL param persistence so filter survives refresh (`?filter=hot,repeat`)
- [ ] Filter params validated against allowlist on read (no arbitrary param injection)
- [ ] Active filter count badge on chip strip

### 1.5 — TodaySection component
**Files:** `components/today/TodaySection.tsx`

- [ ] Props: `title`, `count`, `defaultOpen`, `items`, `renderItem`
- [ ] Collapsible with smooth animation (framer-motion, already a dep)
- [ ] Persists collapsed state in localStorage per section key
- [ ] Section header shows count badge, collapses to one row when closed
- [ ] "AI Is Handling" section renders summary rows (grouped by sequence name) not individual cards
- [ ] Empty state per section: clean message, not blank space

### 1.6 — Autopilot badge + inline card actions
**Files:** `components/leads/NewLeadCard.tsx`, `components/today/WaitingItem.tsx`

- [ ] Autopilot badge: shows sequence name + next step time when `sequenceStatus` active
  - e.g., "AI working · next text Thu 8am"
- [ ] ROI reason line on every card: one sentence from `decision.reasons[0]`
  - e.g., "High value: repeat buyer + fast responder" or "Wait: sequence active, no new signal"
- [ ] Inline action buttons (contextual by section):
  - Replied: "Reply" (primary) · "Trust Sequence" · "Park"
  - Human Now: "Call" · "Text" · "Trust Sequence" · "Park"
  - AI Is Handling: "Take Over" · "Park"
  - Follow Up Later: "Work Now" · "Archive"
  - Low ROI: "Archive" · "Restart"
- [ ] Actions call `POST /api/today/action` and optimistically re-home card
- [ ] Optimistic re-home: card slides out of section, count updates immediately

### 1.7 — TodayContent.tsx restructure
**Files:** `app/(app)/today/TodayContent.tsx`

- [ ] Replace current tier-based flat list with 5 `TodaySection` components
- [ ] Pass classified items to each section (no duplication — one item, one section)
- [ ] Render summary strip above filter chips above sections
- [ ] Preserve existing: TaskItem, UpcomingAppointmentsList, DealerBrief, ReviewsSection (below queue)
- [ ] Loading skeleton matches new section layout
- [ ] Mobile: sections stack vertically, strip is single row with overflow scroll

### 1.8 — Tests
**Files:** `lib/__tests__/todayClassifier.test.ts`, `lib/__tests__/today-action-route.test.ts`

- [ ] Classifier: 10+ test cases covering all waterfall branches and edge cases
- [ ] Action route:
  - [ ] 401 if unauthenticated
  - [ ] 403 if activityId belongs to different org
  - [ ] 400 on invalid action enum
  - [ ] 400 on snooze with past date
  - [ ] 200 on valid park action, verifies DB write
  - [ ] Rate limit test (61st request returns 429)

**Definition of done — Phase 1:**
- [ ] Sections render with correct counts for real data
- [ ] Waterfall assignment matches expected buckets for 10 manually verified leads
- [ ] Inline actions re-home correctly (optimistic + server confirmed)
- [ ] No cross-tenant data access possible via action endpoint
- [ ] Lint clean, build passes
- [ ] All Phase 1 tests pass

---

## Phase 2 — Takeover Exception Detection
**Goal:** When a sequence is active but the customer sends a buying signal, auto-surface the lead in Replied / Take Over with a reason.
**Status:** [ ] Not started. Requires Phase 1 complete.

### 2.1 — Buying signal detector
**Files:** `lib/today/takeoverDetector.ts`

- [ ] `detectTakeoverSignal(lastInboundBody: string): TakeoverSignal | null`
- [ ] Returns: `{ trigger: 'financing' | 'appointment' | 'coming_today' | 'objection' | 'strong_intent', reason: string }`
- [ ] Implementation: pattern-match on keyword sets (no LLM cost for Phase 2)
  - Financing: "payment", "down payment", "financing", "how much", "afford", "monthly"
  - Appointment: "come in", "stop by", "when are you open", "today", "tomorrow", "appointment"
  - Strong intent: "I want it", "I'll take it", "ready to buy", "sold"
  - Objection: patterns that need human nuance ("but", "however", "not sure", "my wife")
- [ ] Pure function, fully unit-testable
- [ ] Returns null (no signal) for most messages — runs cheap

### 2.2 — Wire into classifier
**Files:** `lib/today/queueSort.ts`, `app/(app)/today/page.tsx`

- [ ] Page.tsx: fetch last inbound activity body for leads in `ai_handling` bucket (lazy — only for that set)
- [ ] Classifier: if `detectTakeoverSignal(lastInboundBody)` returns non-null → override to `replied`, set takeover badge
- [ ] `QueueItem` gets `takeoverSignal?: TakeoverSignal` field
- [ ] Card shows badge: "Take over — customer mentioned financing"

### 2.3 — Sequence exception email/SMS alert (stretch)
- [ ] When takeover exception fires, optionally notify rep via SMS or in-app notification
- [ ] Controlled by `org_settings.takeover_alerts_enabled` flag

### 2.4 — Tests
- [ ] Detector: 20+ keyword test cases, false positive check on neutral messages
- [ ] Classifier integration: sequence-active lead with inbound buying signal → lands in replied
- [ ] Sequence-active lead with neutral "ok thanks" → stays in ai_handling

**Definition of done — Phase 2:**
- [ ] Takeover badge appears on real data where buying signals are present
- [ ] False positive rate acceptable (tested against sample message corpus)
- [ ] No new DB queries beyond what Phase 1 already loads

---

## Phase 3 — Ghost State + Bulk Actions
**Goal:** Make non-response a first-class state. Give reps batch tools to clear noise fast.
**Status:** [ ] Not started. Requires Phase 2 complete.

### 3.1 — Ghost detection rules
**Files:** `lib/today/queueSort.ts`

- [ ] Ghost = all of: outbound touches ≥ 3, no inbound in 7+ days, intent score < threshold
- [ ] Configurable thresholds: `GHOST_OUTBOUND_MIN = 3`, `GHOST_SILENCE_DAYS = 7`
- [ ] Ghost leads auto-assign to `low_roi` section with reason: "N touches, N days silent, low intent"
- [ ] Ghost state clears automatically on any new inbound activity

### 3.2 — Bulk action toolbar
**Files:** `components/today/TodayBulkBar.tsx`, `app/api/today/bulk-action/route.ts`

- [ ] Checkbox on each card (appears on hover/focus)
- [ ] Bulk bar appears when 1+ selected: "N selected · Park All · Trust Sequence · Archive All · Clear"
- [ ] `POST /api/today/bulk-action`
  - Auth: `requireProfile()`
  - Body: `{ activityIds: string[], action: BulkAction }`
  - Validate: max 50 IDs per request (abuse guard)
  - Validate: all activityIds belong to authenticated org (single query, compare count)
  - Execute update in single DB write
  - Rate limit: 10 bulk ops/min/org
- [ ] Security: activityIds ownership check is a single `SELECT COUNT(*) WHERE id IN (...) AND user_id = orgId` — if count != ids.length, reject entire batch
- [ ] Optimistic: cards animate out immediately, rollback on error

### 3.3 — Low ROI section UX
- [ ] Low ROI section shows reason per card: "14 days silent · 5 touches · cold intent"
- [ ] "Archive all Low ROI" one-tap action at section header
- [ ] Archived leads: `completed_at` set, removed from Today, visible in customer record history
- [ ] Confirm dialog before bulk archive (destructive action)

### 3.4 — Tests
- [ ] Bulk action route: ownership check rejects mixed-org ID list
- [ ] Bulk action route: max 50 IDs enforced
- [ ] Ghost classifier: correctly identifies 3-touch / 7-day silent lead
- [ ] Ghost clears on new inbound activity

**Definition of done — Phase 3:**
- [ ] Ghost leads auto-surface in Low ROI with correct reason text
- [ ] Bulk park / trust sequence / archive works for up to 50 leads
- [ ] Bulk action cannot affect another org's activities (tested)

---

## Phase 4 — Focus Session
**Goal:** "Show me the best 5 leads for the next 30 minutes." Category-defining feature.
**Status:** [ ] Not started. Requires Phase 3 complete.

### 4.1 — Rep Attention Score
**Files:** `lib/today/repAttentionScore.ts`

- [ ] `computeRepAttentionScore(item: QueueItem): number` — 0–100
- [ ] Inputs (all already available):
  - `lead_intent_score` (0–100): weight 0.30
  - Reply recency (`last_inbound_at`): weight 0.25 — decay curve, 0 after 48h
  - Urgency (`delayRisk`): weight 0.20
  - Repeat buyer (`prior_purchase_count > 0`): +15 flat
  - Contactability (not opted out, has phone): +10 flat
  - Automation load: -20 if sequence active with no exception
  - Already replied pending: +25 flat (cap at 100)
- [ ] Score is labeled "Best use of time" in UI, not exposed as a number
- [ ] Fully deterministic, no LLM

### 4.2 — Focus Session mode
**Files:** `components/today/FocusSession.tsx`, `app/(app)/today/page.tsx`

- [ ] "Focus Session" button in page header
- [ ] Launches overlay: shows top 5 leads by repAttentionScore from Human Now + Replied sections only
- [ ] Each card shows: contact info, next action, ROI reason, one-tap action buttons
- [ ] Progress bar: "3 of 5 done"
- [ ] "Next 5" link when all actioned
- [ ] Session ends: "Great session. 5 leads handled." with summary
- [ ] Session is client-only — no DB writes for session state
- [ ] Keyboard navigable (enterprise accessibility requirement)

### 4.3 — "Top N" mode persistence
- [ ] URL param `?focus=5` locks page to top-N view
- [ ] Shareable: rep can bookmark "Today top 10"
- [ ] N validated: must be 1–25 (no unbounded params)

### 4.4 — Tests
- [ ] RepAttentionScore: weights sum correctly, score bounded 0–100
- [ ] Focus session renders correct top-5 from mixed section data
- [ ] N param validation rejects out-of-range values

**Definition of done — Phase 4:**
- [ ] Focus Session shows accurate top-5 for real data
- [ ] All cards actioned in session → session end state renders
- [ ] Keyboard nav: tab through cards, enter to act, escape to exit

---

## Phase 5 — Last-Ditch Campaign + Recommended Archive
**Goal:** Before a lead is archived, fire one final breakup message. If they reply, pull them back. If not, make archiving a one-tap confirm.
**Status:** [x] Complete

### Workflow
```
Low ROI card → [Send Last-Ditch] → card enters "Waiting for reply" sub-state (48h)
  ├─ Customer replies → takeover detector fires → card moves to Replied / Take Over
  └─ 48h elapsed, no reply → card shows "Archive recommended" CTA → one-tap confirm
```

### 5.1 — Migration 120: last_ditch tracking on customers
**File:** `supabase/migrations/120_last_ditch_campaign.sql`

- [x] `last_ditch_sent_at TIMESTAMPTZ` on `customers` — cooldown anchor (30-day default)
- [x] Index on `(user_id, last_ditch_sent_at)` for cron/query use

### 5.2 — sendLastDitchMessage()
**File:** `lib/leads/lastDitch.ts`

- [x] Validates: has phone, SMS consent, not opted out, no active sequence, cooldown not active
- [x] Sends via Twilio with StatusCallback to `/api/twilio/status`
- [x] Logs activity row (outbound SMS, type = `sms`)
- [x] Sets `last_ditch_sent_at` on customer record
- [x] Returns typed result: `sent | skipped_consent | skipped_sequence | skipped_cooldown | skipped_no_phone | failed`

### 5.3 — POST /api/today/last-ditch
**File:** `app/api/today/last-ditch/route.ts`

- [x] `requireProfile()` first
- [x] Body: `{ activityId: uuid }` — Zod validated
- [x] Ownership check: fetch activity, assert `user_id === org_id`
- [x] Calls `sendLastDitchMessage()` with customer data from activity join
- [x] On send: sets `today_section_override = 'low_roi'`, `today_park_until = now + 48h`
- [x] Rate limit: reuses `orgTodayActionLimiter`
- [x] Error responses: never expose raw DB errors or Twilio errors

### 5.4 — Recommended Archive sub-state in classifier
**File:** `lib/today/queueSort.ts`

- [x] `QueueItem` gets `lastDitchState?: 'waiting' | 'archive_recommended' | null`
- [x] `waiting`: `last_ditch_sent_at` set AND `last_ditch_sent_at + 48h > now`
- [x] `archive_recommended`: `last_ditch_sent_at` set AND 48h elapsed AND no inbound reply since send
- [x] Both states only appear on leads already in `low_roi` section

### 5.5 — UI: Low ROI section last-ditch states
**Files:** `components/today/TodaySection.tsx`, `app/(app)/today/TodayContent.tsx`

- [x] Low ROI cards get contextual action: "Send Last-Ditch Text" (replaces "Archive" as primary)
- [x] After send: card shows "Waiting for reply · 48h" sub-label, send button disabled
- [x] After 48h: card shows "No reply · Archive recommended" with green "Archive" CTA
- [x] Confirm dialog before archive (one sentence: "This lead will be removed from Today.")
- [x] Optimistic UI: button disables immediately, rolls back on error

### 5.6 — Tests
**File:** `lib/__tests__/lastDitch.test.ts`, `lib/__tests__/last-ditch-route.test.ts`

- [x] `sendLastDitchMessage`: skips on no consent, active sequence, cooldown active, no phone
- [x] Route: 401 unauthenticated, 403 cross-tenant, 400 invalid body, 200 valid send
- [x] Classifier: `lastDitchState = 'waiting'` within 48h, `archive_recommended` after 48h

**Security checklist — Phase 5:**
- [x] `requireProfile()` gates route
- [x] Ownership verified before any Twilio call or DB write
- [x] SMS consent + opt-out checked before every send
- [x] Cooldown prevents spam (30-day minimum between last-ditch messages per customer)
- [x] No active sequence check (don't compete with automation)
- [x] Rate limited via existing `orgTodayActionLimiter`
- [x] Twilio errors logged server-side, generic message returned to client

---

## Cross-Cutting Enterprise Requirements (all phases)

### Security (every phase must pass before merge)
- [ ] All action routes: `requireProfile()` first, no exceptions
- [ ] All mutations: fetch resource + assert `user_id = org_id` before write
- [ ] No activityId or customerId trusted from client without DB ownership verification
- [ ] Filter params validated against allowlist (no arbitrary query injection)
- [ ] Bulk actions: ownership verified in single query, max size enforced
- [ ] Rate limits: single actions 60/min, bulk 10/min
- [ ] Error responses: never expose DB errors, stack traces, or other org's data

### Reliability
- [ ] Optimistic UI updates roll back cleanly on server error
- [ ] Section counts recomputed after every action (no stale counts)
- [ ] Snooze wake: park_until checked at query time, not via cron (no missed wakes)
- [ ] Classifier is a pure function — safe to call multiple times with same input

### Accessibility
- [ ] All new interactive elements keyboard navigable
- [ ] Section collapse/expand: `aria-expanded`, `aria-controls`
- [ ] Card action buttons: descriptive `aria-label` (not just icon)
- [ ] Focus Session: full keyboard flow, escape exits
- [ ] Color not used as sole signal (badges have text labels)

### Performance
- [ ] Classifier runs client-side on already-fetched data — zero extra DB calls (Phase 1)
- [ ] Phase 2 takeover detection: only fetches last inbound for `ai_handling` subset
- [ ] Section counts derived from classified array, not separate COUNT queries
- [ ] Filter chips applied to in-memory array, no re-fetch

### Mobile
- [ ] Summary strip: single row, overflow scroll on narrow viewports
- [ ] Filter chips: horizontal scroll, no wrapping
- [ ] Section cards: full width, action buttons accessible via swipe or tap
- [ ] Focus Session: full-screen overlay on mobile

---

## File Map (all phases)

### New files
```
lib/today/takeoverDetector.ts           (Phase 2)
lib/today/repAttentionScore.ts          (Phase 4)
components/today/TodaySummaryStrip.tsx  (Phase 1)
components/today/TodayFilterChips.tsx   (Phase 1)
components/today/TodaySection.tsx       (Phase 1)
components/today/TodayBulkBar.tsx       (Phase 3)
components/today/FocusSession.tsx       (Phase 4)
app/api/today/action/route.ts           (Phase 1)
app/api/today/bulk-action/route.ts      (Phase 3)
supabase/migrations/119_today_lead_state.sql  (Phase 1)
lib/__tests__/todayClassifier.test.ts   (Phase 1)
lib/__tests__/today-action-route.test.ts (Phase 1)
lib/__tests__/takeoverDetector.test.ts  (Phase 2)
lib/__tests__/repAttentionScore.test.ts (Phase 4)
```

### Modified files
```
lib/today/queueSort.ts                  (Phase 1, 2, 3)
app/(app)/today/TodayContent.tsx        (Phase 1, 4)
app/(app)/today/page.tsx               (Phase 1, 2, 4)
components/leads/NewLeadCard.tsx        (Phase 1, 2)
components/today/WaitingItem.tsx        (Phase 1)
```

---

## Release Gate (before any phase ships)
1. `npx eslint "app/**/*.ts" "lib/**/*.ts" --max-warnings=0`
2. `npm test` — all tests pass, Phase tests not skipped
3. `npm run build` — no type errors
4. Manual smoke: open Today with real data, verify section assignments match expectations
5. Security: attempt cross-tenant action via curl, confirm 403
