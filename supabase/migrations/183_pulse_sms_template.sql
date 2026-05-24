-- Migration 183: customisable pulse survey SMS invitation template
-- Allows orgs to personalise the SMS sent when a pulse survey is triggered.
-- NULL = use the system default message.

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS pulse_sms_template TEXT;
