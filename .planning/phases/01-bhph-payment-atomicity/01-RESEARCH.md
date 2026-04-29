# Phase 1: BHPH Payment Atomicity - Research

**Researched:** 2026-04-29
**Domain:** Supabase Postgres RPC / payment finalization atomicity
**Confidence:** HIGH — all findings sourced directly from reading production code and migration files

---

## Summary

The BHPH online payment confirmation path lives entirely in `app/api/pay/[token]/route.ts`, in the `action === 'confirm'` branch of the POST handler. After verifying the Stripe PaymentIntent server-side, the code performs three sequential, independent writes with no transaction wrapper:

1. `bhph_payment_tokens` — update `status = 'paid'`, set `paid_at`, set `stripe_payment_intent_id`
2. `activities` — insert a "payment received" note
3. `bhph_payments` — read `total_paid` + `next_due_date`, then update `total_paid` and `next_due_date`

If write 1 succeeds but write 2 or 3 fails (network blip, constraint violation, Supabase cold start), the token is marked paid but the contract is not advanced and no activity is logged. There is no recovery path. The idempotency guard only checks `stripe_payment_intent_id` equality on a retry for write 1 — writes 2 and 3 have no idempotency protection at all.

**Primary recommendation:** Replace writes 1–3 with a single `supabase.rpc('finalize_bhph_payment', {...})` call backed by a Postgres function that wraps all three writes in an explicit `BEGIN ... COMMIT` with `EXCEPTION` rollback. The RPC is the only external-facing change; all business logic moves into the function.

---

## The Three Writes — Exact Code Location

**File:** `app/api/pay/[token]/route.ts`, lines 182–244

### Write 1 — Mark token paid (line 182)
```typescript
await supabase.from('bhph_payment_tokens')
  .update({ status: 'paid', paid_at: paidAt, stripe_payment_intent_id: payment_intent_id })
  .eq('id', pt.id)
  .eq('status', 'pending')   // optimistic lock — only succeeds if still pending
  .select('id')
  .maybeSingle()
```
The `.eq('status', 'pending')` acts as an optimistic lock. If `updatedToken` comes back null, the code re-reads the token to check for idempotency (`status === 'paid' && stripe_payment_intent_id === payment_intent_id`). This is the only guard in the flow.

### Write 2 — Insert activity log (line 212)
```typescript
await supabase.from('activities').insert({
  user_id:     pt.org_id,
  customer_id: pt.customer_id,
  type:        'note',
  direction:   'inbound',
  body:        `BHPH payment of $${pt.amount} received via Stripe online payment.`,
  priority:    'normal',
  completed_at: paidAt,
})
```
No error check. Fire-and-forget. If this throws, execution continues to write 3.

### Write 3 — Advance contract (lines 224–244)
```typescript
// First: READ contract
const { data: contract } = await supabase.from('bhph_payments')
  .select('total_paid, monthly_payment, next_due_date, payment_frequency')
  .eq('id', pt.bhph_contract_id).maybeSingle()

// Then: UPDATE contract
await supabase.from('bhph_payments').update({
  total_paid:         newTotalPaid,
  next_due_date:      nextDue.toISOString().slice(0, 10),
  last_reminder_type: null,
}).eq('id', pt.bhph_contract_id)
```
This is a read-then-write with a race window. Two concurrent confirmations for the same contract (e.g., webhook retry + customer double-tap) would both read the same `total_paid` baseline and both write the same incremented value — losing one payment's worth of credit.

---

## Table Schemas

### bhph_payment_tokens (migration 080)
```sql
id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid()
org_id                  UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
customer_id             UUID          NOT NULL REFERENCES customers(id)     ON DELETE CASCADE
bhph_contract_id        UUID          NOT NULL REFERENCES bhph_payments(id) ON DELETE CASCADE
amount                  NUMERIC(10,2) NOT NULL CHECK (amount > 0)
token                   TEXT          NOT NULL UNIQUE      -- index: idx_bhph_payment_tokens_token
status                  TEXT          NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending', 'paid', 'expired'))
stripe_payment_intent_id TEXT                             -- nullable, no UNIQUE constraint
created_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
paid_at                 TIMESTAMPTZ
expires_at              TIMESTAMPTZ   NOT NULL DEFAULT (now() + interval '7 days')
```
**Key finding:** `stripe_payment_intent_id` has NO UNIQUE constraint. The optimistic lock is the `.eq('status', 'pending')` filter on the update, not a DB-level uniqueness guarantee on the Stripe ID.

### bhph_payments (migrations 006 + 007)
```sql
id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid()
user_id                 UUID          NOT NULL REFERENCES auth.users(id)  -- this is org_id
vehicle_id              UUID          NOT NULL REFERENCES vehicles(id)
customer_id             UUID          NOT NULL REFERENCES customers(id)
down_payment            NUMERIC       DEFAULT 0
loan_amount             NUMERIC
monthly_payment         NUMERIC       NOT NULL
payment_day_of_month    INT           NOT NULL CHECK (BETWEEN 1 AND 31)
next_due_date           DATE          NOT NULL
total_paid              NUMERIC       DEFAULT 0
status                  TEXT          DEFAULT 'active' CHECK (IN ('active','paid_off','defaulted'))
notes                   TEXT
created_at              TIMESTAMPTZ   DEFAULT now()
-- Added in migration 007:
payment_frequency       TEXT          DEFAULT 'monthly' CHECK (IN ('weekly','biweekly','monthly'))
frequency_anchor_date   DATE
payment_day_anchor      INT
sms_consent             BOOLEAN       DEFAULT false
sms_consent_at          TIMESTAMPTZ
sms_consent_ip          TEXT
sms_consent_disclosure  TEXT
email_consent           BOOLEAN       DEFAULT false
email_consent_at        TIMESTAMPTZ
customer_email          TEXT
reminder_sequence_status TEXT         DEFAULT 'active'
last_reminder_type      TEXT
last_reminder_at        TIMESTAMPTZ
```
Note: `user_id` in `bhph_payments` stores the org's UUID (same pattern as elsewhere). RLS policy uses `user_id = (SELECT org_id FROM profiles WHERE id = auth.uid())`.

### activities (migration 001 + subsequent ALTER migrations)
```sql
id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4()
user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
customer_id   UUID        REFERENCES customers(id) ON DELETE SET NULL
vehicle_id    UUID        REFERENCES vehicles(id) ON DELETE SET NULL
type          TEXT        NOT NULL CHECK (IN ('call','sms','email','note','task','appointment',
                                             'fax','sequence','voicemail','web_lead'))
direction     TEXT        CHECK (IN ('inbound','outbound'))
outcome       TEXT        CHECK (IN ('answered','no_answer','left_vm','pending'))
body          TEXT
due_at        TIMESTAMPTZ
completed_at  TIMESTAMPTZ
snoozed_until TIMESTAMPTZ
duration_seconds INT
priority      TEXT        NOT NULL DEFAULT 'normal' CHECK (IN ('high','normal','low'))
created_at    TIMESTAMPTZ DEFAULT NOW()
```
**Key constraint:** NO `org_id` column. Inserting `org_id` breaks writes. The RPC must NOT pass `org_id` to the activities insert — it must use `user_id` (which carries the org's UUID in BHPH context, per the existing codebase pattern).

---

## Where Confirm is Called From

Confirm logic is entirely in `app/api/pay/[token]/route.ts` (the POST handler, `action === 'confirm'` branch). There is no separate confirm route. The client-side payment page POSTs `{ action: 'confirm', payment_intent_id: '...' }` to `/api/pay/[token]`.

This is a public route (no `requireProfile()`). It uses `createServiceClient()` — correct per CLAUDE.md policy for public token routes with no user session.

---

## Client Used

`createServiceClient()` — service role, bypasses RLS. Correct and documented. The RPC function must also execute with service role. Since the calling route already uses `createServiceClient()`, calling `supabase.rpc(...)` on that same client is sufficient.

---

## Existing Tests for BHPH Pay Flow

**None.** The only test files found are:
- `lib/__tests__/security.test.ts` — unrelated security tests
- `lib/__tests__/helpers/smoke.test.ts` — smoke helper
- `lib/__tests__/helpers/testClient.ts` — mock client builder (not a test itself)

There are zero unit or integration tests for `app/api/pay/[token]/route.ts` or `lib/bhph/paymentToken.ts`. The test helper (`makeTestClient`) already stubs `supabase.rpc` as `vi.fn().mockResolvedValue({ data: null, error: null })`, so adding RPC tests is supported without changing the test helper.

---

## Migration Numbering

Last numeric migration is `106_storage_used_bytes.sql`. There are also two non-numeric files (`CLEANUP_*`, `SEED_*`). The next migration should be:

**`107_finalize_bhph_payment_rpc.sql`**

---

## RPC Function Design

### Function signature
```sql
CREATE OR REPLACE FUNCTION public.finalize_bhph_payment(
  p_token_id              UUID,
  p_stripe_payment_intent TEXT,
  p_paid_at               TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
```

### Parameters needed (from reading confirm path)
| Parameter | Source in current code |
|-----------|----------------------|
| `p_token_id` | `pt.id` (UUID, not the raw token string — ID is safer) |
| `p_stripe_payment_intent` | `payment_intent_id` from request body |
| `p_paid_at` | `new Date().toISOString()` — pass from caller for consistency |

### What the function must do (in a single transaction)
1. Lock and update `bhph_payment_tokens`: `status = 'paid'`, `paid_at`, `stripe_payment_intent_id` WHERE `id = p_token_id AND status = 'pending'`. If 0 rows affected, re-read to distinguish "already paid by this PI" (idempotent OK) vs "paid by different PI" (conflict 409). Return appropriate JSONB result.
2. Read `bhph_payment_tokens` to get `org_id`, `customer_id`, `bhph_contract_id`, `amount` (needed for step 3 and 4).
3. Insert into `activities`: `user_id = org_id`, `customer_id`, `type = 'note'`, `direction = 'inbound'`, `body`, `priority = 'normal'`, `completed_at = p_paid_at`.
4. Update `bhph_payments` using `total_paid + amount` directly in SQL (no read-then-write race) and advance `next_due_date` using a CASE expression on `payment_frequency`. Reset `last_reminder_type = NULL`.
5. Return `'{"ok": true}'::jsonb` on success.

### Date arithmetic in Postgres (replaces JS date logic)
```sql
next_due_date = CASE
  WHEN payment_frequency = 'weekly'   THEN next_due_date + INTERVAL '7 days'
  WHEN payment_frequency = 'biweekly' THEN next_due_date + INTERVAL '14 days'
  ELSE                                     next_due_date + INTERVAL '1 month'
END
```

### Return shape (for TypeScript caller)
```typescript
const { data, error } = await supabase.rpc('finalize_bhph_payment', {
  p_token_id: pt.id,
  p_stripe_payment_intent: payment_intent_id,
  p_paid_at: paidAt,
})
// data: { ok: true } | { already_processed: true } | null
// error: PostgrestError | null
```

---

## Current Guard Against Double-Confirm

The existing idempotency check (lines 198–209 of `pay/[token]/route.ts`) works as follows:
- Write 1 uses `.eq('status', 'pending')` — if token already paid, `updatedToken` is null
- Then re-reads token; if `status === 'paid' && stripe_payment_intent_id === payment_intent_id`, returns `{ ok: true, already_processed: true }`
- If same token but different PI, returns 409

This logic must be reproduced inside the RPC. The RPC handles idempotency at the DB level, eliminating the double read-and-check from application code.

---

## Edge Cases and Risks

### 1. Concurrent confirm requests (race condition)
**Current:** Two near-simultaneous POSTs can both pass the pre-check and attempt write 1. The `.eq('status', 'pending')` filter on the UPDATE acts as an optimistic lock — only one will get a row back. The second will hit the idempotency re-check path. This is correct but only protects write 1; writes 2 and 3 may still double-fire if the timing is unlucky.
**After RPC:** The DB lock on the token row during the transaction prevents the second request from proceeding until the first commits. Correct by construction.

### 2. `stripe_payment_intent_id` has no UNIQUE constraint
Not a blocker for the RPC — the optimistic lock on `status` is sufficient. But worth noting that a UNIQUE constraint on `(stripe_payment_intent_id)` WHERE NOT NULL would be belt-and-suspenders. Can be added in migration 107 as well.

### 3. `total_paid` arithmetic
Current code: `(Number(contract.total_paid) || 0) + Number(pt.amount)` — guards against null. In Postgres: `COALESCE(total_paid, 0) + p_amount`. Equivalent.

### 4. `loan_amount` / paid_off check
`BhphRecordPayment.tsx` (the manual record-payment UI component) handles `paid_off` status when `total_paid >= loan_amount`. The online payment path (`pay/[token]/route.ts`) does NOT set `status = 'paid_off'` — it always stays `'active'`. This is pre-existing behavior; the RPC should preserve it (do not add paid-off logic unless explicitly scoped).

### 5. `activities` type CHECK constraint
Current payment activity uses `type = 'note'`. The `activities_type_check` constraint in migration 102 includes `'note'` — no issue.

### 6. `SECURITY DEFINER` requirement
The RPC must be `SECURITY DEFINER` so it runs with the function owner's privileges (typically postgres/service role), bypassing RLS on `activities` which uses `user_id = auth.uid()`. The calling service client already bypasses RLS, but the function itself runs as the definer. Must set `search_path = ''` per migration 097 pattern.

---

## Architecture Pattern

### Recommended project structure for this change
```
supabase/migrations/
  107_finalize_bhph_payment_rpc.sql   -- new migration (RPC + optional UNIQUE index)

app/api/pay/[token]/route.ts          -- replace 3 writes with 1 rpc() call

lib/__tests__/
  pay-token-confirm.test.ts           -- new unit tests for confirm logic
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Atomic multi-table write | Application-level retry/compensate | Postgres function with implicit transaction |
| Idempotency check | Complex app-level re-read logic | `UPDATE ... WHERE status = 'pending'` inside the transaction |
| Date arithmetic | JS Date manipulation in app code | Postgres `INTERVAL` arithmetic in RPC |
| Race-free `total_paid` increment | Read-then-write in app code | `total_paid = COALESCE(total_paid, 0) + p_amount` in single UPDATE |

---

## Common Pitfalls

### Pitfall 1: Calling rpc() without awaiting error
**What goes wrong:** `await supabase.rpc(...)` returns `{ data, error }`. If caller ignores `error`, partial failures are silent.
**How to avoid:** Always destructure and check `error`. Map RPC JSONB result codes to HTTP status codes in the route handler.

### Pitfall 2: search_path not set on SECURITY DEFINER function
**What goes wrong:** search_path hijacking risk, also flagged by Supabase Security Advisor.
**How to avoid:** Add `SET search_path = ''` to function definition — per migration 097 pattern.
**Warning signs:** Supabase Security Advisor will flag it immediately.

### Pitfall 3: Inserting org_id into activities
**What goes wrong:** `activities` has no `org_id` column — insert fails with column-not-found error.
**How to avoid:** RPC uses `user_id = p_org_id`. Do not pass `org_id` as a separate insert column.

### Pitfall 4: RPC returning void instead of JSONB
**What goes wrong:** `supabase.rpc()` with a void function returns `data: null` on success, making it impossible to distinguish success from error without inspecting `error` alone.
**How to avoid:** Return `JSONB` so the caller can distinguish `{ ok: true }` from `{ already_processed: true }` without a second round-trip.

### Pitfall 5: Migrating before deploying route change (or vice versa)
**What goes wrong:** If migration runs first and the old route still fires, the 3 sequential writes still run (no regression, but no benefit). If route deploys first, `rpc('finalize_bhph_payment')` call fails with "function does not exist".
**How to avoid:** Deploy migration to Supabase, then deploy app. Standard order.

---

## Code Examples

### RPC call from route handler (replaces lines 182–244)
```typescript
// Source: direct replacement for confirm branch in app/api/pay/[token]/route.ts
const paidAt = new Date().toISOString()

const { data: rpcResult, error: rpcError } = await supabase.rpc('finalize_bhph_payment', {
  p_token_id:              pt.id,
  p_stripe_payment_intent: payment_intent_id,
  p_paid_at:               paidAt,
})

if (rpcError) {
  return NextResponse.json({ error: 'Could not finalize payment' }, { status: 500 })
}

const result = rpcResult as { ok?: boolean; already_processed?: boolean; conflict?: boolean } | null

if (result?.conflict) {
  return NextResponse.json({ error: 'Token already processed' }, { status: 409 })
}

if (result?.already_processed) {
  return NextResponse.json({ ok: true, already_processed: true })
}

return NextResponse.json({ ok: true })
```

### Postgres RPC skeleton
```sql
-- Migration 107: Atomic BHPH payment finalization RPC
CREATE OR REPLACE FUNCTION public.finalize_bhph_payment(
  p_token_id              UUID,
  p_stripe_payment_intent TEXT,
  p_paid_at               TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token   public.bhph_payment_tokens%ROWTYPE;
  v_updated INT;
BEGIN
  -- 1. Optimistic-lock update (only succeeds if status = 'pending')
  UPDATE public.bhph_payment_tokens
  SET status                   = 'paid',
      paid_at                  = p_paid_at,
      stripe_payment_intent_id = p_stripe_payment_intent
  WHERE id     = p_token_id
    AND status = 'pending'
  ;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Check idempotency: already paid by this same PI?
    SELECT * INTO v_token FROM public.bhph_payment_tokens WHERE id = p_token_id;
    IF v_token.status = 'paid' AND v_token.stripe_payment_intent_id = p_stripe_payment_intent THEN
      RETURN '{"already_processed": true}'::JSONB;
    END IF;
    RETURN '{"conflict": true}'::JSONB;
  END IF;

  -- Re-read token for downstream use
  SELECT * INTO v_token FROM public.bhph_payment_tokens WHERE id = p_token_id;

  -- 2. Log payment activity
  INSERT INTO public.activities (user_id, customer_id, type, direction, body, priority, completed_at)
  VALUES (
    v_token.org_id,
    v_token.customer_id,
    'note',
    'inbound',
    'BHPH payment of $' || v_token.amount || ' received via Stripe online payment.',
    'normal',
    p_paid_at
  );

  -- 3. Advance contract (race-free increment + date advance)
  UPDATE public.bhph_payments
  SET
    total_paid          = COALESCE(total_paid, 0) + v_token.amount,
    next_due_date       = CASE
                            WHEN payment_frequency = 'weekly'   THEN next_due_date + INTERVAL '7 days'
                            WHEN payment_frequency = 'biweekly' THEN next_due_date + INTERVAL '14 days'
                            ELSE                                      next_due_date + INTERVAL '1 month'
                          END,
    last_reminder_type  = NULL
  WHERE id = v_token.bhph_contract_id;

  RETURN '{"ok": true}'::JSONB;

EXCEPTION WHEN OTHERS THEN
  RAISE; -- Let Postgres roll back and surface the error to the caller
END;
$$;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequential writes in app code | Single atomic RPC | This phase | Eliminates partial-state failures |
| Read-then-write total_paid | SQL increment in RPC | This phase | Eliminates race condition on concurrent confirms |
| App-level idempotency check (2 queries) | RPC-level check (1 transaction) | This phase | Correct under concurrency |

---

## Open Questions

1. **Should `stripe_payment_intent_id` get a UNIQUE constraint?**
   - What we know: Currently nullable, no constraint. The optimistic lock is sufficient.
   - What's unclear: Whether Stripe can ever reuse PI IDs (it cannot by design, but belt-and-suspenders).
   - Recommendation: Add `UNIQUE` partial index `WHERE stripe_payment_intent_id IS NOT NULL` in migration 107. Low risk.

2. **Should the RPC also set `status = 'paid_off'` when `total_paid >= loan_amount`?**
   - What we know: The manual `BhphRecordPayment.tsx` does this; the online path never has.
   - What's unclear: Whether this is intentional product behavior or an omission.
   - Recommendation: Do NOT add paid-off logic in this phase. Preserve existing behavior. Scope separately.

3. **Does the `pay/[token]` page need to be updated (client-side)?**
   - What we know: The page POSTs `{ action: 'confirm', payment_intent_id }` — the request shape does not change.
   - Recommendation: No client-side change needed.

---

## Sources

### Primary (HIGH confidence)
- `app/api/pay/[token]/route.ts` — direct source read, exact lines 130–249
- `lib/bhph/paymentToken.ts` — direct source read
- `supabase/migrations/006_sale_bhph.sql` — bhph_payments schema
- `supabase/migrations/007_bhph_full.sql` — bhph_payments additions
- `supabase/migrations/080_stripe_pay_and_booking.sql` — bhph_payment_tokens schema
- `supabase/migrations/001_init.sql` lines 47–62 — activities schema
- `supabase/migrations/102_schema_constraints.sql` — activities type CHECK constraint
- `supabase/migrations/097_security_advisor_fixes.sql` — SECURITY DEFINER + search_path pattern

### Secondary (MEDIUM confidence)
- `app/(app)/bhph/BhphRecordPayment.tsx` — manual record payment flow (shows what online path omits)

---

## Metadata

**Confidence breakdown:**
- Three writes / exact code: HIGH — read directly from source
- Table schemas: HIGH — read directly from migrations
- stripe_payment_intent_id constraints: HIGH — migration 080 confirmed nullable, no UNIQUE
- Migration number: HIGH — 106 is last numeric migration, next is 107
- RPC design: HIGH — straightforward translation of existing logic
- Existing tests: HIGH — none exist; confirmed by filesystem search

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (stable codebase, low churn area)
