-- Seed principal_balance for active interest-bearing contracts that never started tracking.
-- Ledger replay (app ensureBhphContractFinance / repair-ledger) still required when payments exist.

UPDATE public.bhph_payments
SET principal_balance = GREATEST(
  0::NUMERIC,
  ROUND((COALESCE(loan_amount, 0) - COALESCE(down_payment, 0))::NUMERIC, 2)
)
WHERE status = 'active'
  AND COALESCE(interest_rate, 0) > 0
  AND principal_balance IS NULL
  AND COALESCE(loan_amount, 0) > 0;
