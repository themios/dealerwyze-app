# Phase 9: Transactions & Commissions — Research

**Researched:** 2026-05-28
**Domain:** RE transaction pipeline, commission calculation, Supabase RPC patterns, Remotion Lambda
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## Summary

Phase 9 builds on an already-migrated foundation. `transactions` and `commission_plans` tables exist from migration 180 but are bare-minimum schemas that need additive columns before the UI can implement TXN-01 through TXN-07. The existing BHPH module provides the exact pattern to follow: an atomic Supabase RPC for state-changing operations (close), route-level validation, and a section-picker panel on the listing detail page. Document attachment reuses `VehicleDocuments` + the `/api/vehicles/[id]/documents` route verbatim — no new storage infrastructure needed. Remotion Lambda is fully operational, but no RE listing composition exists; TXN-08 is a meaningful build that should be treated as a confirmed stretch goal with a clear split decision.

**Primary recommendation:** Implement TXN-01 through TXN-07 in Phase 9. Defer TXN-08 (Remotion RE video) to Phase 10 or a dedicated media phase — it requires a new Remotion composition, a new `video_templates` row, a deploy of the Remotion bundle to Lambda, and a separate DB column for `listing_video_id` on transactions.

---

## Schema Audit: What Migration 180 Provides vs. What the Phase Needs

### `transactions` table (migration 180) — current columns
```
id, org_id, vehicle_id, buyer_id, seller_id,
listing_agent_id, buyer_agent_id,
closing_date DATE, closing_price DECIMAL(12,2),
commission_pct DECIMAL(5,2), co_broke_pct DECIMAL(5,2),
gci_listing DECIMAL(10,2), gci_buyer DECIMAL(10,2),
status TEXT CHECK ('pending','closed','cancelled'),
notes TEXT, created_at
```

### Gaps — migration 193 must add
| Missing column | Type | Purpose |
|---|---|---|
| `offer_amount` | DECIMAL(12,2) | TXN-01: accepted offer price (may differ from closing_price) |
| `offer_date` | DATE | TXN-03: key date |
| `inspection_deadline` | DATE | TXN-03: contingency date |
| `contingencies` | TEXT[] or JSONB | TXN-01: list of contingency strings |
| `pipeline_status` | TEXT | TXN-02: richer enum — see below |
| `commission_snapshot` | JSONB | TXN-06: computed at close, never recalculated |
| `commission_plan_id` | UUID REFERENCES commission_plans(id) | TXN-05/06: which plan applied |
| `transaction_number` | TEXT | Human-readable deal reference (auto-generated) |

**Status enum extension:** The current `status` CHECK is `('pending','closed','cancelled')`. TXN-02 requires the pipeline states: `offer` → `under_contract` → `closing` → `closed` | `fallen_through`. Migration 193 should drop and recreate the CHECK constraint with the expanded set. Map existing `pending` → `offer`, `closed` → `closed`, `cancelled` → `fallen_through` in a data migration step.

### `commission_plans` table (migration 180) — current columns
```
id, org_id, agent_id, tier_name, threshold_gci,
split_pct, effective_at, created_at
```

**Gaps — migration 194 must add**
| Missing column | Type | Purpose |
|---|---|---|
| `agent_split_pct` | DECIMAL(5,2) | Agent's share of GCI (replaces ambiguous `split_pct`) |
| `broker_split_pct` | DECIMAL(5,2) | Broker's cut (agent_split + broker_split = 100) |
| `referral_fee_flat` | DECIMAL(10,2) | Optional flat referral amount paid off the top |
| `referral_fee_pct` | DECIMAL(5,2) | Alternative: referral as % of GCI before split |
| `plan_type` | TEXT CHECK | `'percentage_split'` | `'flat_fee'` — determines calculation path |
| `is_default` | BOOLEAN DEFAULT false | Office-level default when agent has no specific plan |

**Recommended commission_snapshot JSONB structure (TXN-06):**
```json
{
  "plan_id": "uuid",
  "plan_type": "percentage_split",
  "closing_price": 450000,
  "commission_pct": 3.0,
  "gross_commission": 13500,
  "referral_fee": 500,
  "net_commission_pool": 13000,
  "listing_agent_split_pct": 70,
  "listing_agent_amount": 9100,
  "broker_amount": 3900,
  "co_broke_pct": 3.0,
  "buyer_side_gross": 13500,
  "buyer_agent_split_pct": 70,
  "buyer_agent_amount": 9450,
  "calculated_at": "2026-05-28T00:00:00Z"
}
```

---

## Architecture Patterns

### Pattern 1: Panel on Listing Detail Page (TXN-01/02/03/04/07)

The listing detail page (`app/(app)/vehicles/[id]/page.tsx`) already uses a section-picker pattern with `VEHICLE_DETAIL_SECTION_IDS`. Transactions live as a new panel on this page — no separate `/transactions/` route needed for basic flow.

**Implementation:**
- Add `VEHICLE_DETAIL_SECTION_IDS.transaction = 'vehicle-detail-transaction'` to `vehicleDetailSectionIds.ts`
- Show panel when `isRe === true` (hide for dealer vertical)
- Panel renders a `<TransactionPanel vehicleId={id} orgId={profile.org_id} />` client component
- Panel fetches `GET /api/transactions?vehicle_id=X` and renders status + key fields

### Pattern 2: BHPH RPC for Atomic Close (TXN-06)

The BHPH `finalize_bhph_sale_with_deferred` RPC is the exact pattern for commission calculation at close time. The commission calculation must be done in a Postgres function (`close_transaction`) that:

1. Fetches the applicable `commission_plans` row for each agent
2. Computes the `commission_snapshot` JSONB
3. UPDATEs `transactions` setting `status = 'closed'`, `commission_snapshot = ...`, `closing_date = now()`
4. Updates `vehicles.status = 'sold'`, `vehicles.sold_price = closing_price`, `vehicles.sold_at = now()`

All in a single transaction. **Commission calculation belongs in the RPC, not in the API route.** Route-level validation (auth, input sanitization) feeds into the RPC call.

```sql
-- Migration 195: Postgres function
CREATE OR REPLACE FUNCTION public.close_re_transaction(
  p_org_id UUID,
  p_transaction_id UUID,
  p_closing_price NUMERIC,
  p_closing_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txn transactions%ROWTYPE;
  v_plan commission_plans%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  -- fetch transaction
  SELECT * INTO v_txn FROM transactions WHERE id = p_transaction_id AND org_id = p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_txn.status = 'closed' THEN RAISE EXCEPTION 'Already closed'; END IF;

  -- fetch applicable plan (agent-specific or org default)
  SELECT * INTO v_plan
  FROM commission_plans
  WHERE org_id = p_org_id
    AND (agent_id = v_txn.listing_agent_id OR (agent_id IS NULL AND is_default = true))
  ORDER BY agent_id NULLS LAST
  LIMIT 1;

  -- build snapshot
  v_snapshot := jsonb_build_object(
    'closing_price', p_closing_price,
    'commission_pct', v_txn.commission_pct,
    'gross_commission', ROUND(p_closing_price * v_txn.commission_pct / 100, 2),
    'calculated_at', now()
    -- ... full structure
  );

  -- atomic updates
  UPDATE transactions
  SET status = 'closed',
      closing_price = p_closing_price,
      closing_date = p_closing_date,
      commission_snapshot = v_snapshot
  WHERE id = p_transaction_id AND org_id = p_org_id;

  UPDATE vehicles
  SET status = 'sold', sold_price = p_closing_price, sold_at = now()
  WHERE id = v_txn.vehicle_id AND user_id = p_org_id;

  RETURN v_snapshot;
END;
$$;
```

### Pattern 3: Document Attachment (TXN-04)

**Reuse `VehicleDocuments` component and `/api/vehicles/[id]/documents` route entirely.** The storage bucket `vehicle-docs`, the `vehicle_documents` table, signed URL generation, and AI summarization already handle RE labels (`'Purchase agreement'`, `'Commission agreement'`, `'Title / escrow docs'`, etc.). Migration 180's INVENTORY_LABELS_RE already includes the right label set.

No new storage or document infrastructure needed. TXN-04 is a UI note: point users to the existing "Private files" section of the listing panel.

### Pattern 4: Commission Plan Configuration UI (TXN-05)

Broker-only settings page at `/settings` (gated on `isDealerAdmin(profile.role)`). New card: "Commission Plans". CRUD for `commission_plans` rows. One row can have `agent_id = NULL` and `is_default = true` as the office default.

**Route:** `POST/GET/PATCH/DELETE /api/commission-plans/`

### Anti-Patterns to Avoid

- **Do not recalculate commission on read.** The `commission_snapshot` JSONB is the record of truth for a closed deal. Plan changes after close must not affect it.
- **Do not use a separate `/transactions/[id]` page initially.** The listing detail panel is sufficient for MVP. A standalone transactions list page is Phase 9B or later.
- **Do not extend `vehicles.status` CHECK for RE-specific pipeline.** The transaction pipeline is on the `transactions` table. `vehicles.status` stays `('available','pending','sold','staging')` — set to `'sold'` only on `close_re_transaction` RPC call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---|---|---|
| File upload for transaction docs | Custom upload route | `VehicleDocuments` component + existing `/api/vehicles/[id]/documents` route |
| Commission calculation on read | Derived column or view | JSONB snapshot stored at close via RPC |
| State machine enforcement | Client-side guards only | Postgres CHECK constraint + RPC validates current state before transition |
| Auth scoping | Request-supplied org_id | `profile.org_id` from `requireProfile()` — same as all other routes |
| Signed URLs for transaction docs | New storage bucket | Existing `vehicle-docs` bucket + `createServiceClient()` pattern |

---

## Common Pitfalls

### Pitfall 1: Status Enum Collision
**What goes wrong:** Migration 193 tries to ADD new values to the existing `status` CHECK on `transactions`, but Postgres requires DROP + ADD for CHECK constraint changes (no ALTER for CHECK values).
**How to avoid:** `ALTER TABLE transactions DROP CONSTRAINT transactions_status_check; ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK (status IN ('offer','under_contract','closing','closed','fallen_through','cancelled'));` — and a data migration: `UPDATE transactions SET status = 'offer' WHERE status = 'pending';`

### Pitfall 2: commission_plans Ambiguity
**What goes wrong:** `split_pct` in migration 180 is ambiguous — it's unclear if it means agent's cut or total commission. If you add `agent_split_pct` alongside it, both exist and callers might use the wrong one.
**How to avoid:** Migration 194 renames `split_pct` to `agent_split_pct` (or deprecates it) and adds the full split structure. Document in the migration comment which columns are authoritative.

### Pitfall 3: Closing a Transaction Without Updating the Listing
**What goes wrong:** `transactions.status` set to `closed` but `vehicles.status` stays `available`, causing the listing to appear active.
**How to avoid:** The `close_re_transaction` RPC atomically updates both in a single PL/pgSQL block.

### Pitfall 4: Broker Interview Not Done Yet
**What goes wrong:** Real commission plans are more complex (tiered splits by volume, graduated schedules, team splits). Building a rigid schema now blocks future requirements.
**How to avoid:** The JSONB `commission_snapshot` and `plan_type` column provide flexibility. The UI offers three plan types: `percentage_split`, `flat_fee`, `tiered`. Only implement `percentage_split` in Phase 9. The schema accommodates the rest.

### Pitfall 5: TXN-08 Scope Underestimate
**What goes wrong:** Assuming the Remotion RE video is a template copy. It is not — all existing compositions use `VehicleVideoProps` which contains auto-specific fields (`mileage`, `vin`, `engine`, `mpgCity`, `mpgHwy`). An RE composition needs a new `ListingVideoProps` type with `bedrooms`, `bathrooms`, `sqft`, `address`, `listPrice`, `propertyType` and a new composition registered in `remotion/Root.tsx`, a new `video_templates` DB row, and a Lambda redeploy of the Remotion bundle.
**How to avoid:** Split TXN-08 into Phase 10. Phase 9 PLAN.md should document this boundary explicitly.

---

## Migration Plan

| Migration | Contents |
|---|---|
| 193 | `transactions` additive columns: `offer_amount`, `offer_date`, `inspection_deadline`, `contingencies JSONB`, `pipeline_status`, `commission_snapshot JSONB`, `commission_plan_id`, `transaction_number`. Status CHECK constraint expansion. RLS policies verified. Indexes: `(org_id, vehicle_id)`, `(pipeline_status)`. |
| 194 | `commission_plans` additive columns: `agent_split_pct`, `broker_split_pct`, `referral_fee_flat`, `referral_fee_pct`, `plan_type`, `is_default`. Backfill `agent_split_pct = split_pct` for existing rows. |
| 195 | `close_re_transaction` PL/pgSQL RPC. SECURITY DEFINER. GRANT EXECUTE to service_role. |

---

## TXN-08 Feasibility Assessment

**Scope for a new RE Remotion composition:**
1. New `ListingVideoProps` type in `remotion/types.ts` (RE-specific fields)
2. New `remotion/ListingVideo/index.tsx` composition (address, photos, beds/baths/sqft, price)
3. Register in `remotion/Root.tsx`
4. Insert row into `video_templates` (migration 196)
5. Extend `renderVehicleVideo` or create parallel `renderListingVideo` lib function
6. New API route `/api/vehicles/[id]/render` already exists — extend or add RE branch
7. Lambda bundle redeploy (manual step via `npx remotion lambda deploy`)

**Verdict:** This is 1-2 days of focused work if the Remotion composition is kept simple (photo slideshow + text overlay for RE fields). The Lambda redeploy is the gate — it must happen after the composition is built. Phase 9 is already dense with TXN-01 through TXN-07. **Recommend deferring TXN-08 to Phase 10.** Note in PLAN.md that the code structure for TXN-08 is clear and can be planned in detail, but the build belongs in Phase 10.

---

## Commission Calculation: RPC vs Route-Level

**Decision: RPC (Postgres function).**

Rationale (from BHPH precedent):
- BHPH uses `finalize_bhph_sale_with_deferred` RPC for all state-changing close logic. Same pattern applies.
- Commission involves multi-table writes (transactions + vehicles) that must be atomic.
- `SECURITY DEFINER` function allows service_role to bypass RLS for the cross-table update while the caller is still validated by the route's `requireProfile()`.
- Route-level code handles: auth check, role gate (`isDealerAdmin`), input validation, then calls `supabase.rpc('close_re_transaction', {...})`.
- Commission arithmetic in the route would run outside the transaction boundary — a network failure after calculation but before write would produce inconsistent state.

---

## Code Examples

### Transaction status transition (route-level guard)
```typescript
// Source: direct inspection of bhph/create/route.ts pattern
const VALID_TRANSITIONS: Record<string, string[]> = {
  offer: ['under_contract', 'fallen_through'],
  under_contract: ['closing', 'fallen_through'],
  closing: ['closed', 'fallen_through'],
  closed: [],
  fallen_through: [],
}

function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
```

### Commission plan lookup (in RPC — conceptual)
```sql
-- Precedence: agent-specific plan > org default (agent_id IS NULL, is_default = true)
SELECT * FROM commission_plans
WHERE org_id = p_org_id
  AND (agent_id = p_agent_id OR (agent_id IS NULL AND is_default = true))
ORDER BY agent_id NULLS LAST
LIMIT 1;
```

### Adding Transaction panel to listing detail
```typescript
// In vehicleDetailSectionIds.ts — add:
transactions: 'vehicle-detail-transactions',

// In vehicles/[id]/page.tsx — add nav entry (RE only):
if (isRe) {
  navSections.push({ id: VEHICLE_DETAIL_SECTION_IDS.transactions, label: 'Transaction' })
}

// Add panel:
panels[VEHICLE_DETAIL_SECTION_IDS.transactions] = (
  <TransactionPanel vehicleId={id} listingAgentId={profile.id} isAdmin={isAdmin} />
)
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| status = ('pending','closed','cancelled') | Expand to pipeline states on transactions table | Enables TXN-02 pipeline tracking without touching vehicles.status |
| split_pct (single ambiguous column) | agent_split_pct + broker_split_pct + plan_type + commission_snapshot | Supports multiple plan types; snapshot is immutable per deal |

---

## Open Questions

1. **Broker interview for real commission plan requirements**
   - What we know: three plan types will cover most cases (percentage split, flat fee, tiered by volume)
   - What's unclear: whether referral fees come off the top before or after broker/agent split
   - Recommendation: Phase 9 implements `percentage_split` only. Schema accommodates others via `plan_type` column. Broker interview fills in Phase 9B.

2. **Transaction number format**
   - What we know: needs a human-readable deal reference
   - What's unclear: desired format (sequential, date-prefixed, address-based)
   - Recommendation: Default to `TXN-{YYYY}-{sequential_4_digit}` generated server-side. Can be made configurable later.

3. **Who can create a transaction — agent only or also broker?**
   - What we know: TXN-01 says "Agent can create" but broker also needs visibility
   - Recommendation: All authenticated RE org members can create/read; only admin/manager can close (role gate on `close_re_transaction` call).

---

## Sources

All findings from direct codebase inspection:

- `/home/tim/Applications/ApolloCRM/apollo-crm/supabase/migrations/180_re_tables.sql` — transactions + commission_plans schemas
- `/home/tim/Applications/ApolloCRM/apollo-crm/app/(app)/vehicles/[id]/page.tsx` — section-picker panel pattern, isRe guard, VehicleDocuments usage
- `/home/tim/Applications/ApolloCRM/apollo-crm/app/api/bhph/create/route.ts` — RPC call pattern for atomic state changes
- `/home/tim/Applications/ApolloCRM/apollo-crm/supabase/migrations/142_bhph_sale_interest_principal.sql` — `finalize_bhph_sale_with_deferred` RPC structure
- `/home/tim/Applications/ApolloCRM/apollo-crm/components/vehicle/VehicleDocuments.tsx` — document upload/list component, RE label sets
- `/home/tim/Applications/ApolloCRM/apollo-crm/app/api/vehicles/[id]/documents/route.ts` — document upload route with quota, storage, AI summarize
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/remotion/renderVehicleVideo.ts` — Lambda render orchestration
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/remotion/types.ts` — VehicleVideoProps (confirms no RE fields exist)
- `/home/tim/Applications/ApolloCRM/apollo-crm/remotion/Root.tsx` — all registered Remotion compositions
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/vehicles/vehicleDetailSectionIds.ts` — section constant pattern
- `/home/tim/Applications/ApolloCRM/apollo-crm/lib/auth/dealerRoles.ts` — role gate functions

---

## Metadata

**Confidence breakdown:**
- Schema gaps: HIGH — read directly from migration 180
- Migration numbering (193+): HIGH — last confirmed migration is 192
- BHPH RPC pattern: HIGH — read directly from migration 142 and bhph/create route
- Document pattern: HIGH — read VehicleDocuments component and API route in full
- Remotion RE scope: HIGH — confirmed no RE composition exists in Root.tsx or types.ts
- Commission plan recommendation: MEDIUM — placeholder structure; real broker requirements unknown

**Research date:** 2026-05-28
**Valid until:** 2026-07-01 (stable stack, no external dependencies changing)
