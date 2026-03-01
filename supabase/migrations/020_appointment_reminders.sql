-- 020_appointment_reminders.sql
-- Add reminder tracking column to activities

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN activities.reminder_sent_at IS
  'Set when a 24h-before SMS reminder was sent for appointment activities';
