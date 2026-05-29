-- Migration 193: Extend transactions table for Phase 9 RE transaction pipeline
-- Additive only — no DROP COLUMN, no ALTER COLUMN TYPE, no data loss
-- transactions table exists from migration 180

-- 1. Add new columns
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS offer_amount       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS offer_date         DATE,
  ADD COLUMN IF NOT EXISTS inspection_deadline DATE,
  ADD COLUMN IF NOT EXISTS contingencies      JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_status    TEXT NOT NULL DEFAULT 'offer',
  ADD COLUMN IF NOT EXISTS commission_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS commission_plan_id UUID REFERENCES commission_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_number TEXT,
  ADD COLUMN IF NOT EXISTS final_sale_price   DECIMAL(12,2);

-- 2. Expand status CHECK constraint to include new RE pipeline statuses
--    Drop the old constraint (which only allowed pending/closed/cancelled)
--    and replace with the expanded set.
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('offer','under_contract','inspection','appraisal','closing','closed','fallen_through','cancelled'));

-- 3. Migrate existing rows: map old status values to new equivalents
UPDATE transactions SET status = 'offer'          WHERE status = 'pending';
UPDATE transactions SET status = 'fallen_through' WHERE status = 'cancelled';

-- 4. Add pipeline_status CHECK constraint
ALTER TABLE transactions
  ADD CONSTRAINT transactions_pipeline_status_check
    CHECK (pipeline_status IN ('offer','under_contract','inspection','appraisal','closing','closed','fallen_through'));

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_org_vehicle
  ON transactions(org_id, vehicle_id);

CREATE INDEX IF NOT EXISTS idx_transactions_pipeline_status
  ON transactions(pipeline_status);

-- 6. RLS — migration 180 already enabled RLS and created transactions_org policy
--    using public.get_org_id(). Add the additional named policy only if it does
--    not already exist (guard with DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transactions'
      AND policyname = 'org members can access own transactions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "org members can access own transactions"
        ON transactions FOR ALL
        USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
    $policy$;
  END IF;
END $$;
