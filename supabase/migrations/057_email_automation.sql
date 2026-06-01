-- Migration 057: Email automation settings
-- Adds independent email automation controls to org_settings.

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS email_automation_mode       text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS email_followup_delay_hours  int  NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS email_followup_next_day_hour int NOT NULL DEFAULT 10;

-- Constrain valid values (matches SMS automation_mode constraint pattern)
ALTER TABLE public.org_settings
  DROP CONSTRAINT IF EXISTS chk_email_automation_mode;
ALTER TABLE public.org_settings
  ADD CONSTRAINT chk_email_automation_mode
    CHECK (email_automation_mode IN ('manual', 'semi_auto', 'full_auto'));
