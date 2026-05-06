-- Migration 137: Atomic BHPH payment finalization (DealerWyze v1.1 Phase 1 — PAY-01..04)
-- Replaces three sequential writes in app/api/pay/[token]/route.ts (token, activity, contract)
-- with one SECURITY DEFINER RPC inside a single transaction.
--
-- Note: 122_leads_assignee_index.sql already exists; this migration is sequenced as 137.
--
-- Design:
--   - SET search_path = '' (Security Advisor pattern, matches other DEFINER functions).
--   - activities has no org_id; user_id carries org UUID (BHPH convention).
--   - Partial UNIQUE on stripe_payment_intent_id for idempotency / duplicate PI guard.
--   - Optimistic UPDATE ... WHERE status = 'pending' for concurrency.
--   - total_paid uses COALESCE + SQL increment (no read-then-write race).

CREATE UNIQUE INDEX IF NOT EXISTS bhph_payment_tokens_pi_id_unique
  ON public.bhph_payment_tokens (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_bhph_payment(
  p_token_id               UUID,
  p_stripe_payment_intent  TEXT,
  p_paid_at                TIMESTAMPTZ DEFAULT now(),
  p_amount                 NUMERIC DEFAULT NULL
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
  UPDATE public.bhph_payment_tokens
  SET
    status                   = 'paid',
    paid_at                  = p_paid_at,
    stripe_payment_intent_id = p_stripe_payment_intent
  WHERE id     = p_token_id
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

  IF p_amount IS NOT NULL AND v_token.amount IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'bhph_finalize_amount_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

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
    'BHPH payment of $' || v_token.amount || ' received via Stripe online payment.',
    'normal',
    p_paid_at
  );

  UPDATE public.bhph_payments
  SET
    total_paid         = COALESCE(total_paid, 0) + v_token.amount,
    next_due_date      = CASE
                           WHEN payment_frequency = 'weekly'   THEN next_due_date + INTERVAL '7 days'
                           WHEN payment_frequency = 'biweekly' THEN next_due_date + INTERVAL '14 days'
                           ELSE                                      next_due_date + INTERVAL '1 month'
                         END,
    last_reminder_type = NULL
  WHERE id = v_token.bhph_contract_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.finalize_bhph_payment(UUID, TEXT, TIMESTAMPTZ, NUMERIC) IS
  'Atomically marks BHPH payment token paid, logs activity, advances contract. Idempotent for same PaymentIntent.';
