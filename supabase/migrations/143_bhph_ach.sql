-- 143: BHPH ACH (Financial Connections + off-session pulls)

-- ─── Contract columns ─────────────────────────────────────────────────────────
ALTER TABLE public.bhph_payments
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_type TEXT NOT NULL DEFAULT 'card'
    CHECK (payment_method_type IN ('card', 'ach', 'manual')),
  ADD COLUMN IF NOT EXISTS bank_verification_status TEXT
    CHECK (bank_verification_status IN ('pending', 'verified', 'failed') OR bank_verification_status IS NULL),
  ADD COLUMN IF NOT EXISTS bank_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ach_setup_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.bhph_payments.stripe_payment_method_id IS 'Stripe PaymentMethod id (ACH us_bank_account or card).';
COMMENT ON COLUMN public.bhph_payments.payment_method_type IS 'card | ach | manual';

-- ─── Payment methods (bank accounts linked to contracts) ─────────────────────
CREATE TABLE IF NOT EXISTS public.bhph_payment_methods (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  bhph_id               UUID REFERENCES public.bhph_payments(id) ON DELETE SET NULL,
  stripe_pm_id          TEXT NOT NULL,
  bank_name             TEXT,
  last4                 TEXT,
  verification_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending', 'verified', 'failed')),
  is_default            BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bhph_payment_methods_org_customer
  ON public.bhph_payment_methods (org_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_bhph_payment_methods_org_bhph
  ON public.bhph_payment_methods (org_id, bhph_id);

ALTER TABLE public.bhph_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bhph_payment_methods_select_org"
  ON public.bhph_payment_methods
  FOR SELECT
  TO authenticated
  USING (org_id = public.get_org_id());

CREATE POLICY "bhph_payment_methods_insert_org"
  ON public.bhph_payment_methods
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.get_org_id());

-- Append-only style: no UPDATE/DELETE for authenticated (service role bypasses RLS).

-- ─── Ledger: allow failed ACH audit rows ─────────────────────────────────────
ALTER TABLE public.bhph_payment_ledger
  DROP CONSTRAINT IF EXISTS bhph_payment_ledger_payment_type_check;

ALTER TABLE public.bhph_payment_ledger
  ADD CONSTRAINT bhph_payment_ledger_payment_type_check
  CHECK (payment_type IN ('regular', 'partial', 'extra', 'payoff', 'failed_ach'));

-- ─── record_bhph_manual_payment: 7th arg + failed_ach ledger-only branch ─────
DROP FUNCTION IF EXISTS public.record_bhph_manual_payment(UUID, NUMERIC, DATE, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.record_bhph_manual_payment(
  p_contract_id            UUID,
  p_amount                 NUMERIC,
  p_payment_date           DATE,
  p_payment_type           TEXT,
  p_notes                  TEXT,
  p_recorded_by            UUID,
  p_stripe_payment_intent  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract   public.bhph_payments%ROWTYPE;
  v_org        UUID;
  v_alloc      JSONB;
  v_adv_due    BOOLEAN;
  v_ledger_id  UUID;
  v_balance_after NUMERIC;
BEGIN
  IF p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'bhph_payment_future_date' USING ERRCODE = 'check_violation';
  END IF;

  IF p_payment_type = 'failed_ach' THEN
    IF p_recorded_by IS NOT NULL THEN
      RAISE EXCEPTION 'bhph_failed_ach_system_only' USING ERRCODE = 'check_violation';
    END IF;

    -- Only the Supabase service role may append failed_ach ledger rows (webhook / cron).
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
      RAISE EXCEPTION 'bhph_failed_ach_service_only' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_contract
      FROM public.bhph_payments
     WHERE id = p_contract_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'bhph_contract_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_balance_after := COALESCE(v_contract.principal_balance, 0::numeric);

    INSERT INTO public.bhph_payment_ledger (
      user_id,
      bhph_contract_id,
      customer_id,
      payment_date,
      amount_paid,
      interest_portion,
      principal_portion,
      principal_balance_after,
      days_since_last,
      payment_type,
      stripe_payment_intent_id,
      notes,
      recorded_by
    ) VALUES (
      v_contract.user_id,
      v_contract.id,
      v_contract.customer_id,
      p_payment_date,
      COALESCE(p_amount, 0),
      0,
      0,
      v_balance_after,
      NULL,
      'failed_ach',
      NULLIF(TRIM(COALESCE(p_stripe_payment_intent, '')), ''),
      p_notes,
      NULL
    )
    RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
      'ok', true,
      'ledger_id', v_ledger_id,
      'failed_ach', true
    );
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'bhph_manual_payment_bad_amount' USING ERRCODE = 'check_violation';
  END IF;

  IF p_payment_type IS NULL OR p_payment_type NOT IN ('regular', 'partial', 'extra', 'payoff') THEN
    RAISE EXCEPTION 'bhph_manual_payment_bad_type' USING ERRCODE = 'check_violation';
  END IF;

  SELECT org_id INTO v_org
    FROM public.profiles
   WHERE id = p_recorded_by
   LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'bhph_manual_payment_bad_recorder' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_contract
    FROM public.bhph_payments
   WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bhph_contract_missing' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_contract.user_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'bhph_manual_payment_forbidden' USING ERRCODE = 'check_violation';
  END IF;

  v_alloc := public.bhph_payment_allocation(
    p_amount,
    p_payment_date,
    v_contract.interest_rate,
    v_contract.principal_balance,
    v_contract.last_payment_date,
    v_contract.created_at
  );

  INSERT INTO public.bhph_payment_ledger (
    user_id,
    bhph_contract_id,
    customer_id,
    payment_date,
    amount_paid,
    interest_portion,
    principal_portion,
    principal_balance_after,
    days_since_last,
    payment_type,
    stripe_payment_intent_id,
    notes,
    recorded_by
  ) VALUES (
    v_contract.user_id,
    v_contract.id,
    v_contract.customer_id,
    p_payment_date,
    p_amount,
    (v_alloc->>'interest_portion')::numeric,
    (v_alloc->>'principal_portion')::numeric,
    (v_alloc->>'principal_balance_after')::numeric,
    (v_alloc->>'days_since_last')::int,
    p_payment_type,
    NULLIF(TRIM(COALESCE(p_stripe_payment_intent, '')), ''),
    p_notes,
    p_recorded_by
  )
  RETURNING id INTO v_ledger_id;

  v_adv_due :=
    (p_amount >= v_contract.monthly_payment)
    AND NOT (
      v_contract.principal_balance IS NOT NULL
      AND (v_alloc->>'principal_balance_after')::numeric <= 0
    );

  UPDATE public.bhph_payments
  SET
    total_paid            = COALESCE(total_paid, 0) + p_amount,
    total_interest_paid   = COALESCE(total_interest_paid, 0) + (v_alloc->>'interest_portion')::numeric,
    principal_balance     = CASE
                              WHEN v_contract.principal_balance IS NOT NULL
                                THEN (v_alloc->>'principal_balance_after')::numeric
                              ELSE v_contract.principal_balance
                            END,
    last_payment_date     = p_payment_date,
    next_due_date         = CASE
                              WHEN v_adv_due AND payment_frequency = 'weekly'
                                THEN next_due_date + INTERVAL '7 days'
                              WHEN v_adv_due AND payment_frequency = 'biweekly'
                                THEN next_due_date + INTERVAL '14 days'
                              WHEN v_adv_due
                                THEN next_due_date + INTERVAL '1 month'
                              ELSE next_due_date
                            END,
    last_reminder_type    = NULL,
    status                = CASE
                              WHEN v_contract.principal_balance IS NOT NULL
                                   AND (v_alloc->>'principal_balance_after')::numeric <= 0
                                THEN 'paid_off'
                              ELSE status
                            END
  WHERE id = p_contract_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ledger_id', v_ledger_id,
    'new_balance', (v_alloc->>'principal_balance_after')::numeric,
    'paid_off',
      (v_contract.principal_balance IS NOT NULL
       AND (v_alloc->>'principal_balance_after')::numeric <= 0),
    'interest_portion', (v_alloc->>'interest_portion')::numeric,
    'principal_portion', (v_alloc->>'principal_portion')::numeric
  );
END;
$$;

COMMENT ON FUNCTION public.record_bhph_manual_payment(UUID, NUMERIC, DATE, TEXT, TEXT, UUID, TEXT) IS
  'Record manual payment, or failed_ach ledger-only row (p_recorded_by NULL, p_payment_type failed_ach).';

GRANT EXECUTE ON FUNCTION public.record_bhph_manual_payment(UUID, NUMERIC, DATE, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_bhph_manual_payment(UUID, NUMERIC, DATE, TEXT, TEXT, UUID, TEXT) TO service_role;
