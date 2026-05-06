-- 141: BHPH interest, principal balance tracking, append-only payment ledger, finalize + manual RPCs.

-- ─── Contract columns ─────────────────────────────────────────────────────────
ALTER TABLE public.bhph_payments
  ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(5, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS principal_balance NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS total_interest_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_date DATE;

COMMENT ON COLUMN public.bhph_payments.interest_rate IS 'Annual nominal rate, e.g. 0.2400 = 24%.';
COMMENT ON COLUMN public.bhph_payments.principal_balance IS 'Outstanding principal; NULL = legacy / not tracked.';
COMMENT ON COLUMN public.bhph_payments.total_interest_paid IS 'Cumulative interest collected.';
COMMENT ON COLUMN public.bhph_payments.last_payment_date IS 'Last payment (calendar) for accrual.';

-- ─── Ledger table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bhph_payment_ledger (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL,
  bhph_contract_id          UUID NOT NULL REFERENCES public.bhph_payments(id) ON DELETE CASCADE,
  customer_id               UUID NOT NULL REFERENCES public.customers(id),
  payment_date              DATE NOT NULL,
  amount_paid               NUMERIC(12, 2) NOT NULL,
  interest_portion          NUMERIC(12, 2) NOT NULL,
  principal_portion         NUMERIC(12, 2) NOT NULL,
  principal_balance_after   NUMERIC(12, 2) NOT NULL,
  days_since_last           INT,
  payment_type              TEXT NOT NULL DEFAULT 'regular'
    CHECK (payment_type IN ('regular', 'partial', 'extra', 'payoff')),
  stripe_payment_intent_id  TEXT,
  notes                     TEXT,
  recorded_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bhph_ledger_contract_date
  ON public.bhph_payment_ledger (user_id, bhph_contract_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_bhph_ledger_customer
  ON public.bhph_payment_ledger (user_id, customer_id);

ALTER TABLE public.bhph_payment_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_bhph_ledger_select" ON public.bhph_payment_ledger
  FOR SELECT
  USING (
    user_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "org_bhph_ledger_insert" ON public.bhph_payment_ledger
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Append-only: no UPDATE / DELETE policies.

-- ─── Shared allocation (immutable helper; not granted to API roles) ───────────
CREATE OR REPLACE FUNCTION public.bhph_payment_allocation(
  p_amount               NUMERIC,
  p_payment_date         DATE,
  p_interest_rate        NUMERIC,
  p_principal_balance    NUMERIC,
  p_last_payment_date    DATE,
  p_created_at           TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_days            INT;
  v_daily           NUMERIC;
  v_interest_acc    NUMERIC;
  v_interest_port   NUMERIC;
  v_principal_port  NUMERIC;
  v_after           NUMERIC;
  v_tracked         BOOLEAN;
  v_start           DATE;
BEGIN
  v_tracked := p_principal_balance IS NOT NULL;
  v_start := COALESCE(p_last_payment_date, (p_created_at AT TIME ZONE 'UTC')::date);
  v_days := GREATEST(0, (p_payment_date - v_start)::int);

  IF p_interest_rate > 0 AND p_principal_balance IS NOT NULL THEN
    v_daily := p_interest_rate / 365;
    v_interest_acc := ROUND(p_principal_balance * v_daily * v_days, 2);
    v_interest_port := LEAST(p_amount, v_interest_acc);
    v_principal_port := p_amount - v_interest_port;
    v_after := GREATEST(0::numeric, p_principal_balance - v_principal_port);
  ELSE
    v_interest_acc := 0;
    v_interest_port := 0;
    v_principal_port := p_amount;
    IF p_principal_balance IS NOT NULL THEN
      v_after := GREATEST(0::numeric, p_principal_balance - v_principal_port);
    ELSE
      v_after := 0::numeric;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'days_since_last', v_days,
    'interest_accrued', COALESCE(v_interest_acc, 0),
    'interest_portion', COALESCE(v_interest_port, 0),
    'principal_portion', COALESCE(v_principal_port, 0),
    'principal_balance_after', v_after,
    'principal_tracked', v_tracked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bhph_payment_allocation(NUMERIC, DATE, NUMERIC, NUMERIC, DATE, TIMESTAMPTZ) FROM PUBLIC;

-- ─── Preserve legacy 4-arg finalize as v1 ────────────────────────────────────
ALTER FUNCTION public.finalize_bhph_payment(UUID, TEXT, TIMESTAMPTZ, NUMERIC)
  RENAME TO finalize_bhph_payment_v1;

COMMENT ON FUNCTION public.finalize_bhph_payment_v1(UUID, TEXT, TIMESTAMPTZ, NUMERIC) IS
  'Legacy BHPH finalize (pre-141). Use finalize_bhph_payment (5-arg) for interest + ledger.';

-- ─── New finalize: ledger + interest + partial due-date rules ────────────────
CREATE OR REPLACE FUNCTION public.finalize_bhph_payment(
  p_token_id               UUID,
  p_stripe_payment_intent  TEXT,
  p_paid_at                TIMESTAMPTZ DEFAULT NOW(),
  p_amount                 NUMERIC DEFAULT NULL,
  p_payment_date           DATE DEFAULT (CURRENT_DATE)
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token     public.bhph_payment_tokens%ROWTYPE;
  v_contract  public.bhph_payments%ROWTYPE;
  v_updated   INT;
  v_pay       NUMERIC;
  v_alloc     JSONB;
  v_adv_due   BOOLEAN;
  v_body      TEXT;
  v_ledger_id UUID;
BEGIN
  IF p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'bhph_payment_future_date' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bhph_payment_tokens
  SET
    status                   = 'paid',
    paid_at                  = p_paid_at,
    stripe_payment_intent_id = p_stripe_payment_intent
  WHERE id = p_token_id
    AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    SELECT * INTO v_token
      FROM public.bhph_payment_tokens
     WHERE id = p_token_id;

    IF v_token.status = 'paid'
       AND v_token.stripe_payment_intent_id IS NOT DISTINCT FROM p_stripe_payment_intent THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true);
    END IF;

    RETURN jsonb_build_object('conflict', true);
  END IF;

  SELECT * INTO v_token
    FROM public.bhph_payment_tokens
   WHERE id = p_token_id;

  v_pay := v_token.amount;

  IF p_amount IS NOT NULL AND v_token.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'bhph_finalize_amount_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_contract
    FROM public.bhph_payments
   WHERE id = v_token.bhph_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bhph_contract_missing' USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_alloc := public.bhph_payment_allocation(
    v_pay,
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
    v_token.customer_id,
    p_payment_date,
    v_pay,
    (v_alloc->>'interest_portion')::numeric,
    (v_alloc->>'principal_portion')::numeric,
    (v_alloc->>'principal_balance_after')::numeric,
    (v_alloc->>'days_since_last')::int,
    'regular',
    p_stripe_payment_intent,
    NULL,
    NULL
  )
  RETURNING id INTO v_ledger_id;

  v_body := format(
    'BHPH payment of $%s received via Stripe online payment. Interest: $%s, Principal: $%s.',
    ROUND(v_pay, 2)::text,
    ROUND((v_alloc->>'interest_portion')::numeric, 2)::text,
    ROUND((v_alloc->>'principal_portion')::numeric, 2)::text
  );

  INSERT INTO public.activities (
    user_id,
    customer_id,
    type,
    direction,
    body,
    priority,
    completed_at
  ) VALUES (
    v_token.org_id,
    v_token.customer_id,
    'note',
    'inbound',
    v_body,
    'normal',
    p_paid_at
  );

  v_adv_due :=
    (v_pay >= v_contract.monthly_payment)
    AND NOT (
      v_contract.principal_balance IS NOT NULL
      AND (v_alloc->>'principal_balance_after')::numeric <= 0
    );

  UPDATE public.bhph_payments
  SET
    total_paid            = COALESCE(total_paid, 0) + v_pay,
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
  WHERE id = v_token.bhph_contract_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ledger_id', v_ledger_id,
    'new_balance', (v_alloc->>'principal_balance_after')::numeric,
    'paid_off',
      (v_contract.principal_balance IS NOT NULL
       AND (v_alloc->>'principal_balance_after')::numeric <= 0)
  );
END;
$$;

COMMENT ON FUNCTION public.finalize_bhph_payment(UUID, TEXT, TIMESTAMPTZ, NUMERIC, DATE) IS
  'Finalize Stripe BHPH token: ledger row, interest split, optional due-date advance when payment >= monthly_payment.';

GRANT EXECUTE ON FUNCTION public.finalize_bhph_payment(UUID, TEXT, TIMESTAMPTZ, NUMERIC, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_bhph_payment_v1(UUID, TEXT, TIMESTAMPTZ, NUMERIC) TO service_role;

-- ─── Manual payment (in-person / check / cash) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.record_bhph_manual_payment(
  p_contract_id   UUID,
  p_amount        NUMERIC,
  p_payment_date  DATE,
  p_payment_type  TEXT,
  p_notes         TEXT,
  p_recorded_by   UUID
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'bhph_manual_payment_bad_amount' USING ERRCODE = 'check_violation';
  END IF;

  IF p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'bhph_payment_future_date' USING ERRCODE = 'check_violation';
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
    NULL,
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

COMMENT ON FUNCTION public.record_bhph_manual_payment(UUID, NUMERIC, DATE, TEXT, TEXT, UUID) IS
  'Record cash/check BHPH payment: same allocation as Stripe finalize; enforces recorder org.';

GRANT EXECUTE ON FUNCTION public.record_bhph_manual_payment(UUID, NUMERIC, DATE, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_bhph_manual_payment(UUID, NUMERIC, DATE, TEXT, TEXT, UUID) TO service_role;
