-- Migration 103: OAuth CSRF columns for state verification
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS gmail_oauth_csrf text,
  ADD COLUMN IF NOT EXISTS gmail_oauth_csrf_expires_at timestamptz;

ALTER TABLE org_google_tokens
  ADD COLUMN IF NOT EXISTS calendar_oauth_csrf text,
  ADD COLUMN IF NOT EXISTS calendar_oauth_csrf_expires_at timestamptz;
