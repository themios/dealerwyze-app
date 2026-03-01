-- 017_automation.sql
-- SMS automation mode preference per org

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS automation_mode TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS lead_response_sla_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS followup_delay_hours INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS followup_next_day_hour INTEGER NOT NULL DEFAULT 10;

-- automation_mode values:
--   manual      — suggested message shown, user taps Send (default)
--   semi_auto   — first message manual, follow-ups auto unless reply
--   full_auto   — full sequence runs automatically unless reply received (premium)

COMMENT ON COLUMN org_settings.automation_mode         IS 'manual | semi_auto | full_auto';
COMMENT ON COLUMN org_settings.lead_response_sla_minutes IS 'Minutes until lead_response task is due (default 10)';
COMMENT ON COLUMN org_settings.followup_delay_hours    IS 'Hours before first follow-up task after response (default 2)';
COMMENT ON COLUMN org_settings.followup_next_day_hour  IS 'Hour of day for next-day follow-up task (24h, default 10 = 10am)';
