-- Migration 194: Extend commission_plans table for Phase 9 commission split tracking
-- Additive only — no DROP COLUMN, no ALTER COLUMN TYPE, no data loss
-- commission_plans table exists from migration 180

-- 1. Add new columns
ALTER TABLE commission_plans
  ADD COLUMN IF NOT EXISTS agent_split_pct   DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS broker_split_pct  DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS co_broke_pct      DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_fee_flat DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_fee_pct  DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_type         TEXT NOT NULL DEFAULT 'percentage_split',
  ADD COLUMN IF NOT EXISTS is_default        BOOLEAN NOT NULL DEFAULT false;

-- 2. plan_type CHECK constraint
ALTER TABLE commission_plans
  DROP CONSTRAINT IF EXISTS commission_plans_plan_type_check;

ALTER TABLE commission_plans
  ADD CONSTRAINT commission_plans_plan_type_check
    CHECK (plan_type IN ('percentage_split','flat_fee','tiered'));

-- 3. Backfill from existing split_pct column
UPDATE commission_plans
SET
  agent_split_pct  = split_pct,
  broker_split_pct = CASE WHEN split_pct IS NOT NULL THEN 100 - split_pct ELSE NULL END,
  plan_type        = 'percentage_split'
WHERE agent_split_pct IS NULL;

-- 4. Partial unique index: one default plan per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_plans_org_default
  ON commission_plans(org_id)
  WHERE is_default = true AND agent_id IS NULL;

-- 5. Lookup index
CREATE INDEX IF NOT EXISTS idx_commission_plans_org_agent
  ON commission_plans(org_id, agent_id);

-- 6. RLS — migration 180 already enabled RLS and created commission_plans_org policy.
--    Add named policies if they don't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_plans'
      AND policyname = 'org members can read commission plans'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "org members can read commission plans"
        ON commission_plans FOR SELECT
        USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_plans'
      AND policyname = 'org admins can modify commission plans'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "org admins can modify commission plans"
        ON commission_plans FOR ALL
        USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
    $policy$;
  END IF;
END $$;
