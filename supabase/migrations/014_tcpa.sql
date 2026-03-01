-- 014_tcpa.sql
-- TCPA compliance: SMS opt-out tracking on customers

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_opt_out     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_out_at  timestamptz;

-- Index for fast opt-out check before every send
CREATE INDEX IF NOT EXISTS idx_customers_sms_opt_out
  ON customers (sms_opt_out)
  WHERE sms_opt_out = true;

COMMENT ON COLUMN customers.sms_opt_out    IS 'True when customer replied STOP. Blocks all outbound SMS.';
COMMENT ON COLUMN customers.sms_opt_out_at IS 'Timestamp when customer opted out (TCPA compliance record).';
