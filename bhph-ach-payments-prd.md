# PRD: BHPH ACH Direct Debit & Payment Fee Management

**Date:** 2026-05-05  
**Status:** Draft  
**Area:** BHPH Billing / Payments

---

## Problem

BHPH dealers currently collect payments via credit/debit card through Stripe. Processing fees (~2.9%) eat into thin margins on already low-ticket installment payments. Customers also want to pay via Zelle, Venmo, or Cash App — but those are push-payment apps with no merchant API, making them impossible to automate. There is no structured way to offer lower-fee alternatives or pass fees to customers compliantly.

---

## Goals

1. Offer ACH bank-to-bank payments as a low-fee, fully automated alternative to cards.
2. Allow dealers to optionally pass card processing fees to customers (surcharging).
3. Give customers a clear two-tier payment choice in every reminder message.
4. Keep manual payment methods (Zelle, Venmo, Cash App) as a supported but non-automated path.

---

## Non-Goals

- Building a Zelle/Venmo/Cash App integration (no merchant API exists for automated pulls).
- Replacing the existing Stripe card flow.
- Supporting crypto or buy-now-pay-later methods.

---

## Background: Payment Method Landscape

| Method | Merchant API | Auto-Pull | Instant Verify | Fee |
|---|---|---|---|---|
| Stripe Card (credit) | ✅ | ✅ | ✅ | ~2.9% + $0.30 |
| Stripe Card (debit) | ✅ | ✅ | ✅ | ~1.5% + $0.30 |
| Stripe ACH Direct Debit | ✅ | ✅ | ✅ (most banks) | 0.8%, cap $5.00 |
| Zelle | ❌ | ❌ | Manual | $0 |
| Venmo | ❌ | ❌ | Manual | $0 |
| Cash App | ❌ | ❌ | Manual | $0 |

**Surcharging rules:**
- Legal in most US states; banned in CT and MA.
- Cannot surcharge debit cards (Durbin Amendment).
- Must cap surcharge at actual processing cost.
- Must disclose surcharge before transaction.
- Visa/Mastercard require merchant registration before surcharging credit cards.

---

## Feature 1: Stripe ACH Direct Debit

### Overview

Integrate Stripe ACH Direct Debit as a payment option on BHPH contracts. Use Stripe Financial Connections for instant bank verification. Once set up, payments pull automatically on the due date — no customer action required per payment.

### Customer Setup Flow

1. Dealer sends a "Set up bank payment" link via SMS (one-time, generated per contract).
2. Customer taps the link, selects their bank from Stripe's UI.
3. Customer logs in to their bank (Stripe's secure hosted flow — same UX as Plaid).
4. Bank is verified instantly (major banks: Chase, BofA, Wells Fargo, etc.).
5. Customer is done. All future payments pull automatically.

**Fallback:** If the bank doesn't support instant verification, customer completes micro-deposit verification (2–3 day wait, enter 2 small deposit amounts). This affects a small percentage of users.

### Payment Pull Behavior

- On each due date, system creates a Stripe PaymentIntent with ACH payment method.
- Stripe initiates the ACH pull (settles in 3–5 business days).
- On success: mark payment as paid in `bhph_payments`, advance `next_due_date`, log activity.
- On failure (NSF, account closed, etc.): webhook triggers retry logic and dealer notification.

### Data Model Changes

Add to `bhph_payments`:
```sql
stripe_customer_id        TEXT,          -- Stripe Customer object
stripe_payment_method_id  TEXT,          -- ACH PaymentMethod ID
payment_method_type       TEXT DEFAULT 'card',  -- 'card' | 'ach' | 'manual'
bank_verification_status  TEXT,          -- 'pending' | 'verified' | 'failed'
bank_verified_at          TIMESTAMPTZ
```

Add `bhph_payment_methods` table to track one or more bank accounts per customer/contract:
```sql
id                UUID PRIMARY KEY,
org_id            UUID NOT NULL REFERENCES organizations(id),
customer_id       UUID NOT NULL,
bhph_id           UUID REFERENCES bhph_payments(id),
stripe_pm_id      TEXT NOT NULL,
bank_name         TEXT,
last4             TEXT,
verification_status TEXT DEFAULT 'pending',
is_default        BOOLEAN DEFAULT true,
created_at        TIMESTAMPTZ DEFAULT now()
```

### API / Edge Function Changes

- `POST /api/bhph/[id]/setup-ach` — creates Stripe SetupIntent + Financial Connections session, returns client_secret for hosted flow.
- `POST /api/bhph/[id]/confirm-ach` — confirms PaymentMethod after customer completes bank link, stores `stripe_payment_method_id`.
- `POST /api/bhph/charge` (existing or new) — for ACH contracts, use stored PaymentMethod instead of card.
- Webhook handler: handle `payment_intent.payment_failed` for NSF/retry flow.

### SMS Trigger

When a BHPH contract is created with ACH intent (or dealer opts to prompt existing customer):

> "Hi [Name], set up automatic bank payments for your [Vehicle] — no fees, pulls automatically each month. Tap here: [link]"

---

## Feature 2: Card Surcharging (Fee Passthrough)

### Overview

Allow dealers to enable surcharging at the org level. When enabled, card payments include a disclosed surcharge equal to the processing cost. ACH and manual payments are never surcharged.

### Surcharge Configuration

Add to `org_settings`:
```sql
surcharge_enabled         BOOLEAN DEFAULT false,
surcharge_rate            NUMERIC(5,4) DEFAULT 0.0290,  -- 2.90%
surcharge_state_verified  BOOLEAN DEFAULT false,        -- dealer confirmed their state allows it
```

Surcharging should be gated behind dealer acknowledgment of:
- Their state permits credit card surcharging.
- They have registered with Visa/Mastercard (or will do so).
- Surcharge will not be applied to debit cards.
- Disclosure will appear on payment links and receipts.

### Fee Calculation

```
surcharge_amount = ROUND(payment_amount * surcharge_rate, 2)
total_charged    = payment_amount + surcharge_amount  (credit card)
total_charged    = payment_amount                     (ACH, debit, manual)
```

Stripe supports passing a fee line item on PaymentIntents — use `metadata` + a separate line item description, or use Stripe Tax/fee features depending on implementation approach.

### Disclosure

Payment link and SMS must show the surcharge before the customer pays:

> "Payment amount: $350.00 | Card processing fee: $10.15 | Total: $360.15"

---

## Feature 3: Two-Tier Payment Reminder Messages

### Overview

All BHPH payment reminders offer customers a clear choice: automated bank payment (ACH, low/no fee) or manual payment (Zelle/Venmo/Cash App, free, manually verified).

### Message Template (ACH set up)

> "Hi [Name], your [Vehicle] payment of **$[amount]** is due [DATE]. It will pull automatically from your bank on file. Questions? Reply HELP."

### Message Template (ACH not set up, surcharging enabled)

> "Hi [Name], your [Vehicle] payment of **$[amount]** is due [DATE].
> 
> Pay by card (fee applies): [payment-link]
> Pay by bank transfer, no fee: [ach-setup-link]
> Pay free via Zelle to [dealer-zelle] / Venmo @[dealer-venmo] — reply PAID when sent.
> 
> Reply HELP for assistance."

### Message Template (ACH not set up, no surcharging)

> "Hi [Name], your [Vehicle] payment of **$350** is due [DATE].
> 
> Pay by card: [payment-link]
> Pay free via Zelle / Venmo / Cash App — reply PAID when sent.
> 
> Reply HELP."

### Manual Payment Confirmation Flow

When customer replies PAID (or dealer marks manually):
- Log payment as `payment_method_type = 'manual'` with a note for the payment app used.
- Dealer gets a notification to verify the incoming transfer in their bank/app.
- After dealer confirms: mark as paid, advance next_due_date.
- If not confirmed within 24h: system flags the payment as unverified.

---

## Feature 4: Dealer Configuration UI

Add a "Payment Methods" section to BHPH settings:

- Toggle: Enable ACH bank payments
- Toggle: Enable card surcharging (with compliance acknowledgment gate)
- Input: Surcharge rate (pre-filled at 2.9%, editable up to 3%)
- Input: Zelle email/phone (for manual payment instructions)
- Input: Venmo handle
- Input: Cash App $cashtag
- Toggle: Include manual payment instructions in reminders

---

## Failure & Edge Cases

| Scenario | Handling |
|---|---|
| ACH NSF / bounce | Webhook fires, dealer notified, retry after 3 days (configurable), flag after 2 failures |
| Customer bank not instant-verifiable | Fall back to micro-deposit flow, delay first ACH pull by 3 days |
| Surcharging in banned state | Block surcharge enable if org state is CT or MA (from org_settings) |
| Debit card presented with surcharge enabled | Detect via Stripe card fingerprint/funding type; waive surcharge automatically |
| Manual payment not confirmed by dealer | Escalate to overdue after grace period, same as any missed payment |
| Customer disputes ACH pull | Stripe handles chargeback; dealer notified; contract flagged |

---

## Success Metrics

- % of BHPH contracts on ACH vs card (target: 40% ACH within 90 days of launch)
- Average processing fee per payment (should decrease as ACH adoption grows)
- ACH setup completion rate (target: >70% when prompted via SMS)
- NSF rate (monitor; target: <8%)
- Manual payment confirmation lag (target: <4h median)

---

## Open Questions

1. Should ACH setup be prompted at contract creation or only via reminder messages?
2. Do we want to support ACH for deferred down payments as well?
3. Should the dealer be able to waive the surcharge per customer (VIP / hardship cases)?
4. What is the retry policy for NSF — number of retries, delay, and late fee trigger?
5. Do we integrate Stripe's built-in surcharge support or calculate manually?

---

## Implementation Phases

**Phase 1 — ACH Setup & Pull (core)**
- ACH setup link generation and hosted bank-link flow
- Store PaymentMethod, trigger pull on due date
- Webhook handling for success/failure
- SMS prompt for new and existing BHPH customers

**Phase 2 — Surcharging**
- Org-level surcharge toggle + compliance gate
- Fee calculation and disclosure on payment links
- Debit detection and automatic fee waiver

**Phase 3 — Manual Payment Tier + Dealer UI**
- Two-tier reminder message templates
- PAID reply handling and dealer confirmation flow
- Dealer settings UI for Zelle/Venmo/Cash App handles

---

## Dependencies

- Stripe Financial Connections enabled on Stripe account
- Stripe ACH Direct Debit enabled (requires Stripe review for some accounts)
- Visa/Mastercard surcharge registration (dealer obligation, not platform)
- Existing `bhph_payments` schema and reminder sequence infrastructure
- Twilio SMS for setup link delivery
