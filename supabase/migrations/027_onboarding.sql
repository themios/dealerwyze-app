-- 027_onboarding.sql
-- Dealer onboarding wizard state tracking

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS onboarding_step          INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at  TIMESTAMPTZ;

-- Mark all EXISTING orgs as already onboarded so they are not redirected
UPDATE org_settings
SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;
