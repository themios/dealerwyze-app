-- Migration 192: Add Cal.com + Google Calendar columns to showings
-- Also adds calcom_username + calcom_event_slug to org_settings for link composition
-- Additive only — no DROP, no ALTER COLUMN, no touch of showing_count (owned by trigger in 191)

ALTER TABLE showings
  ADD COLUMN IF NOT EXISTS cal_booking_uid TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS gcal_event_id   TEXT,
  ADD COLUMN IF NOT EXISTS cal_link        TEXT;

CREATE INDEX IF NOT EXISTS showings_cal_booking_uid_idx
  ON showings(cal_booking_uid) WHERE cal_booking_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS showings_gcal_event_id_idx
  ON showings(gcal_event_id) WHERE gcal_event_id IS NOT NULL;

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS calcom_username   TEXT,
  ADD COLUMN IF NOT EXISTS calcom_event_slug TEXT;

-- Showing reminder dedup — cron job stamps this after sending to prevent double-fire
ALTER TABLE showings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS showings_reminder_sent_at_idx
  ON showings(scheduled_at) WHERE reminder_sent_at IS NULL AND status = 'scheduled';
