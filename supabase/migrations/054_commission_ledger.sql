-- Migration 054: Commission ledger for affiliate/salesperson payouts
-- Tracks earned commissions per event (first_month, recurring, free_to_paid).
-- Pre-built for future Stripe Connect auto-payouts (stripe_transfer_id column).
-- Requires migration 049 (affiliate_codes table) to be applied first.

-- ── Commission ledger ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code       text          NOT NULL REFERENCES public.affiliate_codes(code) ON DELETE RESTRICT,
  org_id               uuid          NOT NULL REFERENCES public.organizations(id)      ON DELETE RESTRICT,
  event_type           text          NOT NULL,   -- 'first_month' | 'recurring' | 'free_to_paid'
  amount               numeric(10,2) NOT NULL CHECK (amount >= 0),
  billing_period       text,                     -- 'YYYY-MM' (month the invoice covers)
  stripe_invoice_id    text,
  status               text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at              timestamptz,
  paid_via             text,                     -- 'venmo' | 'zelle' | 'ach' | 'check' | 'stripe_connect'
  payment_reference    text,                     -- transaction ID / check number / Stripe transfer ID
  stripe_transfer_id   text,                     -- populated when paid via Stripe Connect
  notes                text,
  created_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_code_status
  ON public.commission_ledger(affiliate_code, status);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_org
  ON public.commission_ledger(org_id);

-- Prevent double-crediting the same Stripe invoice for the same affiliate
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_ledger_invoice_dedup
  ON public.commission_ledger(stripe_invoice_id, affiliate_code)
  WHERE stripe_invoice_id IS NOT NULL;

-- ── Future Stripe Connect column on affiliate_codes ────────────────────────────

ALTER TABLE public.affiliate_codes
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

-- ── RLS: service role only — affiliates/salespeople never see commission data ──

ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

-- No policies = no access for authenticated role; service client bypasses RLS.

-- ── Grants ─────────────────────────────────────────────────────────────────────
-- No grants to authenticated role — admin APIs use createServiceClient() only.
