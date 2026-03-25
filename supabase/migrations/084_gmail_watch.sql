-- Migration 084: Gmail Push Notification watch columns
-- Adds watch expiration and history cursor to email_accounts

ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS gmail_watch_expiration TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_history_id TEXT;

COMMENT ON COLUMN email_accounts.gmail_watch_expiration IS 'When the Gmail Pub/Sub watch expires (must be renewed before this time)';
COMMENT ON COLUMN email_accounts.gmail_history_id IS 'Last processed Gmail History ID — used as startHistoryId for the History API';
