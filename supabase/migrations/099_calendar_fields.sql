-- 099_calendar_fields.sql
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS appt_reminder_sent_at TIMESTAMPTZ;

-- Index for reminder cron (finds upcoming appointments not yet reminded)
CREATE INDEX IF NOT EXISTS activities_appt_reminder_idx
  ON activities (due_at, appt_reminder_sent_at)
  WHERE type = 'appointment' AND completed_at IS NULL AND direction IS NULL;
