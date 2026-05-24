-- 181_bhph_lease_fields.sql
-- Phase 1B: Create bhph_contracts table for lease management (RE vertical).
-- UI labels this "Lease Agreement" for real_estate vertical via vertical config.
-- BHPH module is hidden for RE in nav; lease management is a separate nav item.
-- Tim applies this manually in Supabase SQL editor.

-- Create the table if it doesn't exist yet (table was never created in earlier migrations)
CREATE TABLE IF NOT EXISTS bhph_contracts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id       UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id        UUID        REFERENCES vehicles(id) ON DELETE SET NULL,
  -- Core contract fields
  purchase_price    DECIMAL(10,2),
  down_payment      DECIMAL(10,2),
  interest_rate     DECIMAL(5,4) DEFAULT 0,
  term_months       SMALLINT,
  monthly_payment   DECIMAL(10,2),
  start_date        DATE,
  maturity_date     DATE,
  contract_status   TEXT DEFAULT 'active',  -- 'active','paid_off','defaulted','cancelled'
  -- Lease fields (populated for RE vertical)
  lease_type        TEXT,          -- 'month_to_month','annual','fixed_term'
  security_deposit  DECIMAL(10,2),
  pet_deposit       DECIMAL(10,2),
  late_fee_amount   DECIMAL(8,2),
  late_fee_days     SMALLINT DEFAULT 5,
  -- Metadata
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add lease columns to existing table if it already exists (belt-and-suspenders)
ALTER TABLE bhph_contracts
  ADD COLUMN IF NOT EXISTS lease_type       TEXT,
  ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS pet_deposit      DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS late_fee_amount  DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS late_fee_days    SMALLINT DEFAULT 5;

-- RLS: org-scoped read/write
ALTER TABLE bhph_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read bhph_contracts"  ON bhph_contracts;
DROP POLICY IF EXISTS "org members write bhph_contracts" ON bhph_contracts;

CREATE POLICY "org members read bhph_contracts" ON bhph_contracts
  FOR SELECT USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org members write bhph_contracts" ON bhph_contracts
  FOR ALL USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
