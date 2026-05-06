# BHPH module (DealerWyze)

**BHPH** (Buy Here Pay Here) is in-house installment financing: the dealership is the lender and collects payments on a schedule. DealerWyze models a **contract** row (`bhph_payments`), optional **deferred down** installments (`bhph_deferred_payments`), **payment tokens** for customer self-pay (`bhph_payment_tokens`), and an **append-only ledger** (`bhph_payment_ledger`). Sale finalization is done via **`finalize_bhph_sale_with_deferred`** (`supabase/migrations/142_bhph_sale_interest_principal.sql`); payments use **`finalize_bhph_payment`** and **`record_bhph_manual_payment`** (`supabase/migrations/141_bhph_interest_ledger.sql`).

All file paths relative to `apollo-crm/`.

---

### 1. Overview

**Buy Here Pay Here (BHPH)** means the dealership originates and services the retail installment contract instead of a third-party lender. DealerWyze stores the contract on **`bhph_payments`**, tracks scheduled **deferred down** rows on **`bhph_deferred_payments`** when the sale RPC is used, exposes **Stripe pay-by-link** via **`bhph_payment_tokens`**, and records every applied payment on **`bhph_payment_ledger`**. Creating the contract from the CRM uses **`POST /api/bhph/create`** → RPC **`finalize_bhph_sale_with_deferred`** (`supabase/migrations/142_bhph_sale_interest_principal.sql`).

---

### 2. Data Model

#### `bhph_payments` (contract)

Columns **created/updated in committed migrations** (primarily **`142_bhph_sale_interest_principal.sql`** `INSERT` list, plus **`141_bhph_interest_ledger.sql`** additions). Types in `types/index.ts` (`BhphPayment`) are a subset for UI.

| Column | Type (SQL / intent) | Meaning |
|--------|---------------------|---------|
| `id` | UUID PK | Contract id |
| `user_id` | UUID | **Org id** (same convention as `vehicles.user_id` / `customers.user_id`) |
| `vehicle_id` | UUID | Sold unit |
| `customer_id` | UUID | Borrower |
| `down_payment` | NUMERIC | Cash down at sale |
| `required_down_payment` | NUMERIC | Required down per deal |
| `loan_amount` | NUMERIC | Financed amount |
| `monthly_payment` | NUMERIC | Scheduled payment amount (also used to decide due-date advance) |
| `payment_frequency` | TEXT | `'weekly'`, `'biweekly'`, or default monthly logic in RPCs |
| `payment_day_of_month` | INT | Day-of-month component |
| `frequency_anchor_date` | DATE | Anchor for schedule (`p_first_due_date` at creation) |
| `payment_day_anchor` | INT | Anchor day (COALESCE with payment day in 142) |
| `next_due_date` | DATE | Next scheduled due date |
| `customer_email` | TEXT | Contact for reminders / portal |
| `sms_consent` | BOOLEAN | TCPA-related flag |
| `sms_consent_at` | TIMESTAMPTZ | When consent recorded |
| `sms_consent_ip` | TEXT | Client IP at consent |
| `sms_consent_disclosure` | TEXT | Disclosure text |
| `email_consent` | BOOLEAN | Email opt-in |
| `email_consent_at` | TIMESTAMPTZ | Email consent timestamp |
| `notes` | TEXT | Freeform |
| `status` | TEXT | e.g. `'active'`, `'paid_off'` (RPC sets `paid_off` when principal tracked and balance ≤ 0) |
| `reminder_sequence_status` | TEXT | Reminder automation state at insert (`'active'` in 142) |
| `interest_rate` | NUMERIC(5,4) | Annual nominal rate, e.g. `0.2400` = 24% (141 comment) |
| `principal_balance` | NUMERIC(12,2) | Outstanding principal; **NULL** = legacy / not tracked (141) |
| `total_interest_paid` | NUMERIC(12,2) | Cumulative interest (141, default 0) |
| `last_payment_date` | DATE | Last payment calendar date for accrual (141) |

Additional columns used in tests / legacy finalize paths (may exist from older migrations not in this repo): e.g. **`total_paid`**, **`last_reminder_type`** (`lib/__tests__/bhph/finalize-bhph-payment.rpc.integration.test.ts`, `137_finalize_bhph_payment_rpc.sql`).

#### `bhph_payment_tokens`

Purpose: **opaque token** in a public URL; ties a **pending** Stripe payment to `org_id`, `customer_id`, and `bhph_contract_id`. Stripe **PaymentIntent** metadata stores `bhph_payment_token` = token row `id` (`app/api/pay/[token]/route.ts`). **Partial unique index** on `stripe_payment_intent_id` when not null (`137`, `141`).

Fields evidenced in code/tests: `id`, `token`, `amount`, `status` (`pending` / `paid`), `org_id`, `customer_id`, `bhph_contract_id`, `expires_at`, `created_at`, `stripe_payment_intent_id`, `first_viewed_at`, `last_viewed_at`, `view_count` (`app/api/pay/[token]/route.ts`, integration test insert).

#### `bhph_payment_ledger`

**Append-only** payment lines (`141`): RLS **SELECT/INSERT** only — comment states *“Append-only: no UPDATE / DELETE policies.”*

| Column | Meaning |
|--------|---------|
| `id` | UUID PK |
| `user_id` | Org id |
| `bhph_contract_id` | FK → `bhph_payments` |
| `customer_id` | FK → `customers` |
| `payment_date` | Effective date (DATE) |
| `amount_paid` | Total payment |
| `interest_portion` | Portion to interest |
| `principal_portion` | Portion to principal |
| `principal_balance_after` | Balance after payment |
| `days_since_last` | Days in accrual window |
| `payment_type` | `'regular' \| 'partial' \| 'extra' \| 'payoff'` |
| `stripe_payment_intent_id` | Set for Stripe finalize; null for manual |
| `notes` | Manual notes |
| `recorded_by` | `profiles.id` for manual payments; null for Stripe in RPC |
| `created_at` | Insert time |

#### `bhph_deferred_payments`

Deferred **remaining down payment** split into future-dated chunks (`142`): each row has **`user_id`**, **`bhph_id`** (contract), **`vehicle_id`**, **`customer_id`**, **`amount`**, **`due_date`**, **`status`** (e.g. `'scheduled'` on insert), **`notes`**, **`reminder_sequence_status`**. RPC validates deferred rows sum to the remaining required down.

---

### 3. Interest Calculation

Implemented in **`public.bhph_payment_allocation`** (`141`): inputs `p_amount`, `p_payment_date`, `p_interest_rate`, `p_principal_balance`, `p_last_payment_date`, `p_created_at`.

- **Start date:** `v_start := COALESCE(p_last_payment_date, (p_created_at AT TIME ZONE 'UTC')::date)`.
- **Days:** `GREATEST(0, (p_payment_date - v_start)::int)`.
- **If** `p_interest_rate > 0` **and** `p_principal_balance IS NOT NULL`:
  - `daily_rate = p_interest_rate / 365`
  - `interest_accrued = ROUND(principal_balance × daily_rate × days, 2)`
  - `interest_portion = LEAST(amount_paid, interest_accrued)`
  - `principal_portion = amount_paid - interest_portion`
  - `new_balance = GREATEST(0, principal_balance - principal_portion)`
- **Else:** interest portions 0, entire payment to principal (with balance update only when principal is tracked).

Contract update sets **`status` → `paid_off`** when `principal_balance` was tracked and **`principal_balance_after` ≤ 0** (`finalize_bhph_payment` / `record_bhph_manual_payment` in `141`).

---

### 4. RPCs

#### `finalize_bhph_sale_with_deferred` (migration **142**)

- **Parameters** (Postgres): `p_org_id`, `p_vehicle_id`, `p_customer_id`, `p_sold_price`, `p_finance_type`, `p_finance_company`, `p_down_payment`, `p_required_down_payment`, `p_loan_amount`, `p_monthly_payment`, `p_payment_frequency`, `p_payment_day`, `p_first_due_date`, `p_customer_email`, `p_sms_consent`, `p_sms_consent_at`, `p_sms_consent_ip`, `p_sms_consent_disclosure`, `p_email_consent`, `p_email_consent_at`, `p_notes`, `p_deferred_payments` JSONB default `[]`, `p_interest_rate` default `0`.
- **Returns:** `JSONB` e.g. `{ ok: true, bhph_id: <uuid> }`.
- **Atomicity:** single function; marks vehicle sold, may insert BHPH contract + deferred rows + first due task; raises on validation errors.
- **Idempotency:** not idempotent by design — caller should not double-submit.

#### `finalize_bhph_payment` (migration **141**, 5-arg form)

- **Parameters:** `p_token_id UUID`, `p_stripe_payment_intent TEXT`, `p_paid_at TIMESTAMPTZ` default `now()`, `p_amount NUMERIC` default null, `p_payment_date DATE` default `CURRENT_DATE`.
- **Returns:** `JSONB` — `{ ok: true, ledger_id, new_balance, paid_off }` or `{ ok: true, already_processed: true }` or `{ conflict: true }`; may raise `bhph_finalize_amount_mismatch`, `bhph_payment_future_date`, etc.
- **Atomicity:** single transaction inside function: token update, ledger insert, activity insert, contract update.
- **Idempotency:** if token already `paid` with same `stripe_payment_intent_id`, returns **`already_processed`**; concurrent pending updates use row count check.

Legacy **`finalize_bhph_payment_v1`** (4-arg) renamed from **137** — pre-ledger behavior.

#### `record_bhph_manual_payment` (migration **141**)

- **Parameters:** `p_contract_id UUID`, `p_amount NUMERIC`, `p_payment_date DATE`, `p_payment_type TEXT`, `p_notes TEXT`, `p_recorded_by UUID`.
- **Returns:** `JSONB` with `ok`, `ledger_id`, `new_balance`, `paid_off`, `interest_portion`, `principal_portion`.
- **Atomicity:** ledger insert + contract update in one function; verifies `profiles.org_id` matches `bhph_payments.user_id`.
- **Idempotency:** each call appends a new ledger row (caller must not double-submit).

---

### 5. Payment Flows

**A. Stripe token (customer self-pay)**

1. Customer opens **`GET /api/pay/[token]`** — validates token, records view stats (`app/api/pay/[token]/route.ts`).
2. Client **`POST`** with `action` `intent` (or omitted) — server creates Stripe PaymentIntent with dealer secret key and metadata `bhph_payment_token`.
3. After Stripe succeeds, client **`POST`** with `action: 'confirm'` and `payment_intent_id` — server verifies PI with Stripe (amount, currency, metadata, status), then **`supabase.rpc('finalize_bhph_payment', { … p_payment_date: paidAt YMD })`**.

**B. Manual (rep in CRM)**

1. Authenticated user with **`canAccessBhph`** (`lib/auth/dealerRoles.ts`) **`POST /api/bhph/[id]/payment`** (`app/api/bhph/[id]/payment/route.ts`).
2. Zod-validated body: `amount`, `paymentDate`, `paymentType`, optional `notes`.
3. Ownership: contract **`user_id`** must equal effective **`profile.org_id`** (staff cookie applied in `requireProfileForBhphApi`).
4. **`record_bhph_manual_payment`** RPC with parsed date and `p_recorded_by = profile.id`.

---

### 6. API Routes

| Route | Method | Auth | Behavior |
|-------|--------|------|----------|
| `/api/bhph/create` | POST | `requireProfile()`, `canAccessBhph` | Body JSON; calls **`finalize_bhph_sale_with_deferred`** via `createClient()` (`app/api/bhph/create/route.ts`) |
| `/api/pay/[token]` | GET | Public, IP rate limit | Token details + publishable key |
| `/api/pay/[token]` | POST | Public, IP rate limit | `intent` → PaymentIntent; `confirm` → verify + **`finalize_bhph_payment`** |
| `/api/bhph/[id]/payment` | POST | Session + org match + `canAccessBhph` | **`record_bhph_manual_payment`** |
| `/api/bhph/[id]/ledger` | GET | Session + org match + `canAccessBhph` | Lists up to 100 ledger rows for contract (`app/api/bhph/[id]/ledger/route.ts`) |

---

### 7. `next_due_date` advancement

From **`finalize_bhph_payment`** / **`record_bhph_manual_payment`** in **`141`**: define `v_adv_due := (payment_amount >= monthly_payment) AND NOT (principal tracked AND new balance ≤ 0)`. If `v_adv_due`, advance **`next_due_date`** by 7 days, 14 days, or 1 month depending on **`payment_frequency`**; otherwise **`next_due_date` unchanged** (partial payment — customer still owes the remainder of the scheduled payment).

---

### 8. Operational Notes

- Apply migrations **`137`**, **`141`**, **`142`** (and dependencies) before relying on atomic finalize, interest, ledger, and sale interest/principal seeding.
- **Legacy contracts** with **`principal_balance IS NULL`**: allocation skips interest tracking; behavior per `bhph_payment_allocation` `ELSE` branch.
- **Ledger is append-only** — no UPDATE/DELETE policies in `141`; **`GET /api/bhph/[id]/ledger`** only selects rows.

---

*See also `.planning/ARCHITECTURE.md` and `CLAUDE.md`.*
