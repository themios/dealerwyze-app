-- ============================================================
-- Migration 007: Full BHPH payment tracking system
-- ============================================================

-- 1. Customers: add opt-out tracking
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_opted_out boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_opted_out_at timestamptz;

-- 2. Profiles: add dealership timezone
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Los_Angeles';

-- 3. Enhance bhph_payments table
ALTER TABLE bhph_payments
  ADD COLUMN IF NOT EXISTS payment_frequency text DEFAULT 'monthly'
    CHECK (payment_frequency IN ('weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS frequency_anchor_date date,     -- first payment date (for biweekly drift prevention)
  ADD COLUMN IF NOT EXISTS payment_day_anchor int,          -- original day 1-31 (monthly clamping)
  ADD COLUMN IF NOT EXISTS sms_consent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_ip text,
  ADD COLUMN IF NOT EXISTS sms_consent_disclosure text,     -- exact text shown to customer
  ADD COLUMN IF NOT EXISTS email_consent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS reminder_sequence_status text DEFAULT 'active'
    CHECK (reminder_sequence_status IN ('active','paused','completed','opted_out','escalated')),
  ADD COLUMN IF NOT EXISTS last_reminder_type text
    CHECK (last_reminder_type IN ('pre_3day','due_day','late_2day','late_7day') OR last_reminder_type IS NULL),
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

-- Backfill anchor columns for existing records
UPDATE bhph_payments
SET
  frequency_anchor_date = COALESCE(frequency_anchor_date, next_due_date),
  payment_day_anchor     = COALESCE(payment_day_anchor, payment_day_of_month)
WHERE frequency_anchor_date IS NULL;

-- 4. Payment reminder log (audit trail for every sent reminder)
CREATE TABLE IF NOT EXISTS payment_reminder_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  bhph_id          uuid NOT NULL REFERENCES bhph_payments(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES customers(id),
  reminder_type    text NOT NULL CHECK (reminder_type IN ('pre_3day','due_day','late_2day','late_7day')),
  channel          text NOT NULL CHECK (channel IN ('sms','email')),
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','cancelled','failed','skipped_optout','skipped_hours')),
  twilio_sid       text,
  error_code       int,
  error_message    text,
  message_body     text,
  scheduled_for    timestamptz NOT NULL,
  sent_at          timestamptz,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE payment_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_reminder_log" ON payment_reminder_log
  FOR ALL
  USING (user_id = (SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- 5. Index for cron query performance
CREATE INDEX IF NOT EXISTS idx_bhph_active_due
  ON bhph_payments (user_id, status, next_due_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reminder_log_bhph
  ON payment_reminder_log (bhph_id, reminder_type, status);
