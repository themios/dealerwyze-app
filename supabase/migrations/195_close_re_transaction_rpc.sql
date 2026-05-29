-- Migration 195: close_re_transaction PL/pgSQL RPC
-- SECURITY DEFINER so it can atomically update both transactions and vehicles
-- regardless of the caller's RLS context.
-- SET search_path = '' prevents search_path injection; all table refs are schema-qualified.

CREATE OR REPLACE FUNCTION public.close_re_transaction(
  p_org_id         UUID,
  p_transaction_id UUID,
  p_closing_price  NUMERIC,
  p_closing_date   DATE,
  p_closed_by      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txn                  public.transactions%ROWTYPE;
  v_plan                 public.commission_plans%ROWTYPE;
  v_snapshot             JSONB;
  gross_commission       NUMERIC;
  referral_deduction     NUMERIC;
  net_commission_pool    NUMERIC;
  listing_agent_split_pct NUMERIC;
  listing_agent_amount   NUMERIC;
  broker_amount          NUMERIC;
  co_broke_pct_val       NUMERIC;
  buyer_agent_amount     NUMERIC;
BEGIN
  -- 1. Lock and validate the transaction
  SELECT * INTO v_txn
  FROM public.transactions
  WHERE id = p_transaction_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found or access denied';
  END IF;

  IF v_txn.pipeline_status = 'closed' THEN
    RAISE EXCEPTION 'Transaction is already closed';
  END IF;

  IF v_txn.pipeline_status NOT IN ('under_contract','inspection','appraisal','closing') THEN
    RAISE EXCEPTION 'Transaction cannot be closed from current status: %', v_txn.pipeline_status;
  END IF;

  -- 2. Fetch commission plan — agent-specific first, then org default fallback
  SELECT * INTO v_plan
  FROM public.commission_plans
  WHERE org_id = p_org_id
    AND (
      agent_id = v_txn.listing_agent_id
      OR (agent_id IS NULL AND is_default = true)
    )
  ORDER BY agent_id NULLS LAST
  LIMIT 1;

  -- 3. Calculate commission snapshot (no PII or secrets logged)
  gross_commission        := ROUND(p_closing_price * COALESCE(v_txn.commission_pct, 3.0) / 100, 2);
  referral_deduction      := COALESCE(v_plan.referral_fee_flat, 0);
  net_commission_pool     := gross_commission - referral_deduction;
  listing_agent_split_pct := COALESCE(v_plan.agent_split_pct, 70);
  listing_agent_amount    := ROUND(net_commission_pool * listing_agent_split_pct / 100, 2);
  broker_amount           := net_commission_pool - listing_agent_amount;
  co_broke_pct_val        := COALESCE(v_plan.co_broke_pct, 0);
  buyer_agent_amount      := ROUND(gross_commission * co_broke_pct_val / 100, 2);

  v_snapshot := jsonb_build_object(
    'plan_id',                 v_plan.id,
    'plan_type',               COALESCE(v_plan.plan_type, 'percentage_split'),
    'closing_price',           p_closing_price,
    'commission_pct',          COALESCE(v_txn.commission_pct, 3.0),
    'gross_commission',        gross_commission,
    'referral_deduction',      referral_deduction,
    'net_commission_pool',     net_commission_pool,
    'listing_agent_split_pct', listing_agent_split_pct,
    'listing_agent_amount',    listing_agent_amount,
    'broker_amount',           broker_amount,
    'co_broke_pct',            co_broke_pct_val,
    'buyer_agent_amount',      buyer_agent_amount,
    'calculated_at',           now()
  );

  -- 4. Close the transaction
  UPDATE public.transactions
  SET
    pipeline_status    = 'closed',
    status             = 'closed',
    closing_price      = p_closing_price,
    closing_date       = p_closing_date,
    commission_snapshot = v_snapshot,
    commission_plan_id  = v_plan.id  -- may be NULL if no plan found
  WHERE id = p_transaction_id
    AND org_id = p_org_id;

  -- 5. Mark the vehicle as sold
  --    vehicles uses user_id (not org_id) for org scoping per CLAUDE.md gotchas
  UPDATE public.vehicles
  SET
    status     = 'sold',
    sold_price = p_closing_price,
    sold_at    = now()
  WHERE id = v_txn.vehicle_id
    AND user_id = p_org_id;

  -- 6. Return the commission snapshot
  RETURN v_snapshot;
END;
$$;

-- Grant execute to service_role (called from API routes that use service client)
GRANT EXECUTE ON FUNCTION public.close_re_transaction(UUID, UUID, NUMERIC, DATE, UUID)
  TO service_role;
