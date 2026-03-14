-- 070_onboarding_progress.sql
-- Add onboarding tracking to org_settings.
-- Backfill all existing orgs as completed so they are not redirected to /onboarding.

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS onboarding_step        SMALLINT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_settings_onboarding
  ON public.org_settings (org_id, onboarding_completed_at)
  WHERE onboarding_completed_at IS NULL;

-- Backfill: mark all existing orgs as onboarding complete so they are not redirected.
-- New orgs created after this migration will have onboarding_completed_at = NULL (the default).
UPDATE public.org_settings
SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;
