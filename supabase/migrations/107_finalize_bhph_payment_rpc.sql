-- Migration 107: Atomic BHPH payment finalization
-- Replaces three sequential writes in app/api/pay/[token]/route.ts with one atomic RPC.
--
-- Key design decisions:
--   - SECURITY DEFINER so the function runs with owner privileges (bypasses RLS on activities,
--     which uses auth.uid()-based policy — the calling route has no user session).
--   - SET search_path = '' per migration 097 pattern (Supabase Security Advisor requirement).
--   - activities has NO org_id column; tenant context is carried via user_id = org_id.
--   - bhph_payment_tokens.org_id stores org UUID (confirmed via migration 080 and route code).
--   - total_paid incremented with COALESCE + direct SQL arithmetic (no read-then-write race).
--   - next_due_date advanced with INTERVAL arithmetic (no JS Date juggling).

-- Step 1: Add partial UNIQUE index on stripe_payment_intent_id (belt-and-suspenders guard).
-- IF NOT EXISTS is safe: column is currently nullable with sparse data.
CREATE UNIQUE INDEX IF NOT EXISTS bhph_payment_tokens_pi_id_unique
  ON public.bhph_payment_tokens (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Step 2: Create the atomic finalization function.
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
  -- 1. Optimistic-lock UPDATE: only succeeds if token is still 'pending'.
  --    This is the primary concurrency guard; the UNIQUE index is belt-and-suspenders.
  UPDATE public.bhph_payment_tokens
  SET
    status                   = 'paid',
    paid_at                  = p_paid_at,
    stripe_payment_intent_id = p_stripe_payment_intent
  WHERE id     = p_token_id
    AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Token was not pending. Check if this is idempotent replay or a genuine conflict.
    SELECT * INTO v_token
      FROM public.bhph_payment_tokens
     WHERE id = p_token_id;

    IF v_token.status = 'paid'
       AND v_token.stripe_payment_intent_id = p_stripe_payment_intent THEN
      -- Same PI confirming again — safe to return success without re-processing.
      RETURN '{"already_processed": true}'::JSONB;
    END IF;

    -- Different PI or token in unexpected state — caller must not proceed.
    RETURN '{"conflict": true}'::JSONB;
  END IF;

  -- Re-read token to get org_id, customer_id, amount for downstream writes.
  SELECT * INTO v_token
    FROM public.bhph_payment_tokens
   WHERE id = p_token_id;

  -- 2. Log payment activity.
  --    activities has no org_id column; user_id carries the org UUID (BHPH convention).
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

  -- 3. Advance contract: race-free total_paid increment + INTERVAL date advance.
  --    Resets last_reminder_type so the next cycle sends fresh reminders.
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

  RETURN '{"ok": true}'::JSONB;

EXCEPTION WHEN OTHERS THEN
  -- Re-raise so Postgres rolls back the implicit transaction and surfaces the error
  -- to the calling supabase.rpc() as a PostgrestError.
  RAISE;
END;
$$;
