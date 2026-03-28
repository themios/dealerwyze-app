-- 088_sms_consent.sql
-- Double opt-in consent flow for SMS (TCPA / toll-free verification)

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_consent_status      TEXT CHECK (sms_consent_status IN ('pending', 'confirmed')),
  ADD COLUMN IF NOT EXISTS sms_consent_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_confirmed_at TIMESTAMPTZ;

-- Per-org customizable consent message template
-- Placeholders: {first_name}, {business_name}, {vehicle}
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS sms_consent_message TEXT;
