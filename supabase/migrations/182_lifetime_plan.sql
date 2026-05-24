-- Migration 182: Add 'lifetime' plan value for future use.
-- The realtywyze@gmail.com org is set to 'platform' (already in constraint)
-- which the codebase treats as unlimited/free-forever.
--
-- If 'lifetime' is preferred later, run:
--   ALTER TABLE organizations DROP CONSTRAINT IF EXISTS chk_organizations_plan;
--   ALTER TABLE organizations ADD CONSTRAINT chk_organizations_plan
--     CHECK (plan IN ('platform','trial','starter','growth','pro','active','canceled','paused','lifetime'));

-- Set the RealtyWyze test org to platform plan (unlimited, no billing gates)
UPDATE organizations
SET    plan          = 'platform',
       trial_ends_at = NULL
WHERE  id = 'd775c4f7-ab05-4cc5-b8a6-2cdd61ea0626';
