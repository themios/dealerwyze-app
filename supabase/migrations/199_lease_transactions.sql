-- Migration 199: Add lease transaction support
-- Additive — no existing sale transaction data affected.

-- 1. Add transaction_type column (sale is default to preserve existing rows)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'sale'
    CHECK (transaction_type IN ('sale', 'lease'));

-- 2. Add lease-specific financial fields
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS monthly_rent       DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS security_deposit   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS lease_term_months  INTEGER,
  ADD COLUMN IF NOT EXISTS move_in_date       DATE,
  ADD COLUMN IF NOT EXISTS lease_end_date     DATE;

-- 3. Expand pipeline_status CHECK to include lease stages
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_pipeline_status_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_pipeline_status_check
    CHECK (pipeline_status IN (
      -- Sale stages
      'offer', 'under_contract', 'inspection', 'appraisal', 'closing', 'closed',
      -- Shared terminal
      'fallen_through',
      -- Lease stages
      'application', 'approved', 'lease_signed', 'active', 'expired', 'cancelled'
    ));

-- 4. Index on transaction_type for the /leases filtered view
CREATE INDEX IF NOT EXISTS idx_transactions_type
  ON transactions(org_id, transaction_type);
