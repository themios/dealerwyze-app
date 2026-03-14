-- 069_telegram_settings.sql
-- Adds per-org Telegram integration fields to org_settings.
--
-- telegram_chat_id           — the dealer's Telegram chat ID once connected
-- telegram_verify_code       — short-lived 6-digit OTP used during the connect flow
-- telegram_verify_expires_at — when the OTP expires (15 min TTL)

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS telegram_chat_id             TEXT,
  ADD COLUMN IF NOT EXISTS telegram_verify_code         TEXT,
  ADD COLUMN IF NOT EXISTS telegram_verify_expires_at   TIMESTAMPTZ;

-- Index so the webhook can look up an org by chat_id efficiently
CREATE INDEX IF NOT EXISTS idx_org_settings_telegram_chat_id
  ON org_settings (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
