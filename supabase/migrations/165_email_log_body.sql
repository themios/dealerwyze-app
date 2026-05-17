-- 165_email_log_body.sql
-- Add plain-text body to platform_email_log for auditable comms history.

ALTER TABLE platform_email_log
  ADD COLUMN IF NOT EXISTS body_text TEXT;
