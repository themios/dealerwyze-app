# Architecture: RealtyWyze Phase 2–6 Integration

**Researched:** 2026-05-28
**Scope:** Brownfield integration — all new RE features must integrate without breaking dealer functionality.
**Confidence:** HIGH (based on direct codebase inspection)

---

## Foundational Constraint: One Codebase, Two Verticals

The codebase already has a clean vertical split:

- `lib/vertical/` — `realEstateConfig` / `dealerConfig` declare feature flags and labels
- `organizations.vertical` column (`'dealer'` | `'real_estate'`) gates all behavior
- Admin routes detect vertical from host header via `getAdminVerticalScope(req)` — **never `x-vertical`**
- Public listing site: `app/[slug]/listings/` — already exists and renders RE property data

Every new RE feature follows the same isolation rule: read `org.vertical` from the DB (via `requireProfile()` → profile → org lookup), never from the request body.

---

## Component Boundaries

```
┌─────────────────────────────────────────────────────────┐
│  realtywyze.us / dealerwyze.com (same Vercel deployment) │
├──────────────────────┬──────────────────────────────────┤
│  App (authenticated) │  Public (unauthenticated)        │
│  app/(app)/          │  app/[slug]/listings/            │
│  - vehicles/         │  - [id]/                         │
│  - showings/         │  (already built, Phase 1H)       │
│  - transactions/     │                                  │
│  - settings/         │                                  │
├──────────────────────┴──────────────────────────────────┤
│  API Layer  (app/api/)                                   │
│  - /api/vehicles/         (RE listings reuse this)      │
│  - /api/showings/         (new, Phase 2)                │
│  - /api/transactions/     (new, Phase 3)                │
│  - /api/commission-plans/ (new, Phase 3)                │
│  - /api/voice/retell-callback  (extend, Phase 4)        │
│  - /api/voice/re-tools/        (new, Phase 4)           │
│  - /api/integrations/docusign/ (new, Phase 5)           │
├─────────────────────────────────────────────────────────┤
│  Supabase (shared DB, RLS per org via get_org_id())     │
│  - vehicles table (RE listings)                         │
│  - showings table (migration 180)                       │
│  - transactions table (migration 180)                   │
│  - commission_plans table (migration 180)               │
│  - customers (buyer criteria cols, migration 179)       │
├─────────────────────────────────────────────────────────┤
│  External Services                                      │
│  - Retell (dealer agent_id + new RE agent_id)          │
│  - Remotion Lambda (new PropertyReel composition)       │
│  - DocuSign (OAuth, transaction docs)                   │
│  - Cal.com (iframe embed only)                          │
└─────────────────────────────────────────────────────────┘
```

---

## Phase-by-Phase Integration Decisions

### Phase 2 — Listing Import (URL Scrape, Photo Scan, MLS)

**Where the API lives:**

- URL paste → `app/api/listings/intake/parse-url/route.ts` (new)
  - Do NOT extend `app/api/vehicles/intake/parse-text/` — that route has a dealer-specific billing check (`assertCanUseFeature(org_id, 'ai_scan')`). Wrap separately so RE billing can differ.
  - Pattern: `requireProfile()` → verify `org.vertical === 'real_estate'` → call Claude with RE-specific prompt (address, beds, baths, sqft, price, MLS#, property type) → return extracted JSON.

- Photo scan → `app/api/listings/intake/scan-image/route.ts` (new)
  - Same pattern as `app/api/vehicles/intake/scan-image/route.ts` but with RE extraction prompt.
  - Reuse the base64/mimeType validation block verbatim; change only the Claude prompt text.

- MLS/IDX API → `app/api/listings/intake/mls-import/route.ts` (new)
  - Deferred research: IDX broker APIs vary widely (RESO Web API, Bridge Interactive, Spark API). Build a thin adapter interface. Start with manual import (no MLS API) and add the adapter in a follow-on milestone.

**Where data writes:**

- All three import paths write to `vehicles` (same table, same `user_id = profile.org_id` pattern).
- Use the RE-aware field set from migration 179: `address_line1`, `city`, `state`, `zip`, `property_type`, `bedrooms`, `bathrooms`, `sqft`, `mls_number`, `price`, `listing_type`, `idx_source`.
- `year = 0`, `make = 'RE'`, `model = address_line1.slice(0, 100)` — same placeholder pattern already in `POST /api/vehicles`.

**Files to create:**
```
app/api/listings/intake/parse-url/route.ts
app/api/listings/intake/scan-image/route.ts
app/api/listings/intake/mls-import/route.ts   (stub, Phase 2+)
```

**DB changes:** None needed. Migration 179 already has all required columns.

---

### Phase 2 — Showings

**API design:** New top-level resource, not nested under vehicles.

Rationale: Showings have their own lifecycle (scheduled → completed/cancelled), their own contact association, agent assignment, and feedback JSON. Stuffing them under `/api/vehicles/[id]/` would make cross-listing queries (e.g., "all showings for this agent today") awkward.

```
POST   /api/showings/             — schedule a showing
GET    /api/showings/             — list (filter by listing_id, agent_id, date range)
PATCH  /api/showings/[id]/        — update status, add feedback_json
DELETE /api/showings/[id]/        — cancel
```

**Auth pattern:** `requireProfile()` → `createClient()` (RLS handles org isolation via `get_org_id()`).

The `showings` table already has `org_id` and the RLS policy `showings_org` (migration 180). No `createServiceClient()` needed.

**DB changes:** Migration 180 covers the base schema. Likely need one additive migration (189) for:
- `showings.lockbox_code TEXT` — common field agents need in the field
- `showings.confirmation_sent_at TIMESTAMPTZ` — dedup guard for reminder SMS

**Files to create:**
```
app/api/showings/route.ts
app/api/showings/[id]/route.ts
app/(app)/showings/                 — showing calendar/list UI (RE-only, guard with vertical check)
```

---

### Phase 3 — Transactions

**API design:** New top-level resource.

```
POST   /api/transactions/           — create when offer accepted
GET    /api/transactions/           — list with status filter
GET    /api/transactions/[id]/      — detail with milestones
PATCH  /api/transactions/[id]/      — update fields, advance status
```

**Auth pattern:** Same as showings — `requireProfile()` + `createClient()`. The `transactions` table has `org_id` with RLS policy `transactions_org` (migration 180).

**DB changes needed (migration 189 or 190):**
- `transactions.docusign_envelope_id TEXT` — link to DocuSign envelope (Phase 5)
- `transactions.milestone_json JSONB` — checklist of closing steps (inspection, title, appraisal, etc.)
- `transactions.earnest_money DECIMAL(10,2)`
- `transactions.contingency_date DATE`

The current schema in migration 180 is a good start but is lean. Add columns addively, not a rewrite.

**Files to create:**
```
app/api/transactions/route.ts
app/api/transactions/[id]/route.ts
app/(app)/transactions/             — transaction board UI (RE-only)
```

### Phase 3 — Commission Plans

**API design:** Settings-adjacent resource. Brokers configure splits; agents view their own.

```
GET    /api/commission-plans/       — list plans for org (admin) or own agent plan
POST   /api/commission-plans/       — create tier (admin only)
PATCH  /api/commission-plans/[id]/  — update tier
DELETE /api/commission-plans/[id]/  — remove tier
```

**Auth pattern:** `requireProfile()` + role check (`canManageUsers(profile.role)` for write operations). `createClient()` is sufficient — RLS policy `commission_plans_org` handles isolation.

**UI location:** Extend `app/(app)/settings/` with a new tab, not a new top-level nav item. Settings page already has a tab router pattern. Add `app/(app)/settings/commissions/` as an RE-only settings tab (vertical-gated in the tab component).

**Files to create:**
```
app/api/commission-plans/route.ts
app/api/commission-plans/[id]/route.ts
app/(app)/settings/commissions/page.tsx
```

**DB changes:** None. Migration 180 covers `commission_plans`.

---

### Phase 4 — Retell RE Voice Agent

**Webhook design:** Extend the existing webhook, do NOT create a separate route.

The existing `app/api/voice/retell-callback/route.ts` already handles HMAC-SHA256 validation, `call_analyzed` events, and org lookup by phone. The right approach:

1. Add `RETELL_RE_AGENT_ID` env var (separate Retell agent configured for RE scripts).
2. In the webhook handler, after org lookup, check `org.vertical` and branch processing:
   - `'real_estate'` → call `processREVoiceCall()` (new lib function)
   - `'dealer'` → existing `processVoiceCall()` (unchanged)

This keeps the single webhook URL registered in one Retell dashboard entry, avoids managing two webhook endpoints, and keeps the signature validation in one place.

**Tools route:** The existing `app/api/voice/tools/route.ts` handles Retell's tool-call webhooks mid-call (e.g., "look up customer record"). Create `app/api/voice/re-tools/route.ts` for RE-specific tools (showing availability lookup, listing detail retrieval). Retell agents have separate tool URLs configured per agent, so this is clean.

**Env vars to add:**
```
RETELL_RE_AGENT_ID=your-re-agent-id
```

**Files to extend/create:**
```
app/api/voice/retell-callback/route.ts  — extend (add vertical branch)
app/api/voice/re-tools/route.ts         — new (RE-specific Retell tool calls)
lib/voice/reIngest.ts                   — new (RE call processing, mirrors lib/voice/ingest.ts)
```

---

### Phase 4 — Remotion Property Reel

**Template design:** New composition in `remotion/`, registered in `Root.tsx`.

```
remotion/PropertyReel/
  index.tsx       — composition (photos, address overlay, price, bed/bath/sqft badge)
  types.ts        — PropertyReelProps interface
```

Register in `remotion/Root.tsx` alongside existing vehicle compositions. The Lambda function is already deployed and handles any registered composition by ID string — no Lambda redeployment needed if the bundle is rebuilt and re-uploaded.

**API:** The existing `app/api/vehicles/[id]/render/route.ts` already calls `renderVehicleVideo()` which accepts `templateId` as a string. Pass `templateId: 'PropertyReel'` from the RE UI — no API route changes needed, just the new Remotion composition.

**Caution:** The `renderVehicleVideo` lib function generates a narration script using vehicle make/model/year. Add a vertical branch: if `vehicle.make === 'RE'`, generate an RE narration (address, beds/baths, price) instead. This is a lib-level change, not API-level.

**Files to create:**
```
remotion/PropertyReel/index.tsx
remotion/PropertyReel/types.ts
```
**Files to extend:**
```
remotion/Root.tsx            — add PropertyReel Composition
lib/remotion/generateNarration.ts  — add RE branch
```

---

### Phase 5 — DocuSign Integration

**OAuth pattern:** Follow the Gmail OAuth pattern precisely.

Gmail uses: settings page button → server action or route initiates OAuth → Google redirects to `/api/integrations/gmail/callback` → callback exchanges code for token → stores in `org_settings`.

DocuSign follows the same pattern:

```
app/api/integrations/docusign/route.ts          — GET: initiate OAuth redirect
app/api/integrations/docusign/callback/route.ts — GET: exchange code, store token
app/api/integrations/docusign/route.ts          — DELETE: disconnect
app/api/integrations/docusign/envelopes/route.ts — POST: create envelope from transaction
```

**Token storage:** Add `docusign_access_token`, `docusign_refresh_token`, `docusign_account_id` to `org_settings` via a new migration (190 or 191).

**Auth:** The OAuth callback uses `createServiceClient()` (same justification as Gmail — session is not reliable mid-redirect). All other DocuSign routes use `requireProfile()` + `createClient()`.

**Webhook (DocuSign Connect):** DocuSign pushes envelope status updates to a webhook URL. Add `app/api/webhooks/docusign/route.ts`. Validate using DocuSign's HMAC-SHA256 (`X-DocuSign-Signature-1` header). Update `transactions.docusign_envelope_id` and `transactions.status` on `envelope-completed` events.

**Files to create:**
```
app/api/integrations/docusign/route.ts
app/api/integrations/docusign/callback/route.ts
app/api/integrations/docusign/envelopes/route.ts
app/api/webhooks/docusign/route.ts
app/(app)/settings/integrations/    — extend existing or new page for DocuSign connect button
```

**Env vars:**
```
DOCUSIGN_CLIENT_ID=
DOCUSIGN_CLIENT_SECRET=
DOCUSIGN_REDIRECT_URI=
DOCUSIGN_HMAC_KEY=
```

---

### Phase 5 — Cal.com Scheduling

**Integration type:** Iframe embed, not API integration.

Cal.com's public embed script (`cal.com/embed`) works as a simple `<Script>` + `<div data-cal-link="...">`. No OAuth, no token, no backend route needed for the embed itself.

The only backend concern: Cal.com can fire webhooks on booking events. If you want showings to auto-create when a buyer books via Cal.com:
- Add `app/api/webhooks/calcom/route.ts` — validates Cal.com's HMAC signature, creates a `showings` row via service client.
- This is optional for Phase 5; the iframe alone is sufficient for MVP.

**Where to embed:** Within the showing scheduler UI in `app/(app)/showings/new/` — render the Cal.com embed as the scheduling step if the agent has a Cal.com URL configured in their profile.

**Files to create (minimal):**
```
app/api/webhooks/calcom/route.ts    — optional, only if auto-create showings needed
```

**DB change (optional):** Add `profiles.calcom_link TEXT` so each agent stores their Cal.com booking URL.

---

## Build Order (Dependency Graph)

```
Phase 2: Listing Import + Showings
  └── Requires: vehicles table (migration 179, done), showings table (migration 180, done)
  └── No blockers

Phase 3: Transactions + Commission Plans
  └── Requires: vehicles + showings (transactions reference vehicle_id)
  └── Additive migration for transaction milestone/DocuSign columns first

Phase 4: Retell RE Agent + PropertyReel
  └── Requires: showings (agent needs to check availability mid-call)
  └── Retell agent configured in dashboard before code ships
  └── Remotion Lambda bundle rebuild required after adding PropertyReel composition

Phase 5: DocuSign + Cal.com
  └── Requires: transactions (DocuSign envelopes attach to transactions)
  └── DocuSign developer account + sandbox credentials before code ships
  └── Cal.com account per agent (external, no provisioning needed)

Phase 6: Public Listing Site Enhancements (subdomain / MLS SEO)
  └── Requires: all above, no new blockers
  └── app/[slug]/listings/ already exists — extend, don't rebuild
```

---

## DB Schema Changes Summary

| Migration # | What | Why |
|-------------|------|-----|
| 189 | `showings`: add `lockbox_code TEXT`, `confirmation_sent_at TIMESTAMPTZ` | Operational fields needed at Phase 2 |
| 189 | `transactions`: add `docusign_envelope_id TEXT`, `milestone_json JSONB`, `earnest_money DECIMAL(10,2)`, `contingency_date DATE` | Phase 3 + DocuSign prep |
| 190 | `org_settings`: add `docusign_access_token TEXT`, `docusign_refresh_token TEXT`, `docusign_account_id TEXT`, `docusign_base_uri TEXT` | DocuSign OAuth token storage (Phase 5) |
| 191 | `profiles`: add `calcom_link TEXT` | Per-agent Cal.com URL (Phase 5, optional) |

All migrations are additive. No destructive changes. Apply before shipping each phase.

---

## Files: Extend vs Create

### Extend existing files

| File | Change |
|------|--------|
| `app/api/voice/retell-callback/route.ts` | Add vertical branch after org lookup |
| `remotion/Root.tsx` | Register PropertyReel Composition |
| `lib/remotion/generateNarration.ts` | Add RE narration branch |
| `lib/vertical/realEstate.ts` | Add any new feature flags (e.g., `docusign`, `calcom`) |
| `app/(app)/settings/` | Add new tabs for commissions, DocuSign — vertical-gated |

### Create new files

```
app/api/listings/intake/parse-url/route.ts
app/api/listings/intake/scan-image/route.ts
app/api/listings/intake/mls-import/route.ts
app/api/showings/route.ts
app/api/showings/[id]/route.ts
app/api/transactions/route.ts
app/api/transactions/[id]/route.ts
app/api/commission-plans/route.ts
app/api/commission-plans/[id]/route.ts
app/api/voice/re-tools/route.ts
app/api/integrations/docusign/route.ts
app/api/integrations/docusign/callback/route.ts
app/api/integrations/docusign/envelopes/route.ts
app/api/webhooks/docusign/route.ts
app/api/webhooks/calcom/route.ts
lib/voice/reIngest.ts
remotion/PropertyReel/index.tsx
remotion/PropertyReel/types.ts
app/(app)/showings/               — showing list + schedule UI
app/(app)/transactions/           — transaction board UI
app/(app)/settings/commissions/   — broker split configuration
```

---

## Critical Guardrails

**1. Vertical isolation in every new API route**
Every authenticated API route must verify `org.vertical === 'real_estate'` before executing RE-specific logic. Do not rely on UI gating alone. Pattern:
```typescript
const { data: org } = await supabase.from('organizations').select('vertical').eq('id', profile.org_id).single()
if (org?.vertical !== 'real_estate') return NextResponse.json({ error: 'Not available' }, { status: 403 })
```

**2. `showings` and `transactions` use `org_id` directly (unlike `customers`)**
Both tables were designed in migration 180 with `org_id NOT NULL` and RLS via `get_org_id()`. Do not use `user_id` for these. Do not add `org_id` to `customers` or `activities`.

**3. DocuSign OAuth callback must use `createServiceClient()`**
Session is unreliable during OAuth redirect flow. This is the same justification as Gmail OAuth. Add explicit `.eq('org_id', ...)` on every query in the callback handler.

**4. Retell webhook: single endpoint, vertical branch**
Do not register two webhook URLs in Retell. Branch on `org.vertical` inside the handler after org lookup. The HMAC validation runs once before any branching.

**5. Remotion Lambda bundle must be rebuilt and re-uploaded after adding PropertyReel**
The Lambda function renders by composition ID. Adding a new composition to `Root.tsx` requires `npx remotion lambda sites create` to update the S3 bundle. The Lambda function itself does not need redeployment.

**6. Admin routes: always `getAdminVerticalScope(req)` from host header**
Any new admin API route that lists RE transactions, showings, or commission data must use `getAdminVerticalScope(req)` — never `x-vertical` header.

**7. Public listing site: no new route group needed**
`app/[slug]/listings/` and `app/[slug]/listings/[id]/` already exist and already render RE property data. Phase 6 enhancements extend these files; do not create a separate route group.
