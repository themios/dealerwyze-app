-- 016_quota.sql
-- SMS quota tracking + billing tier columns on organizations

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS sms_plan              TEXT    NOT NULL DEFAULT 'tier1',
  ADD COLUMN IF NOT EXISTS sms_quota             INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS monthly_message_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_mms_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_cycle_start   DATE,
  ADD COLUMN IF NOT EXISTS billing_cycle_end     DATE,
  ADD COLUMN IF NOT EXISTS sms_overage_enabled   BOOLEAN NOT NULL DEFAULT true;

-- sms_plan values: tier1 ($14.99, 1k msgs) | tier2 ($29.99, 3k msgs) | tier3 ($59.99, 10k msgs)
COMMENT ON COLUMN organizations.sms_plan              IS 'tier1 | tier2 | tier3';
COMMENT ON COLUMN organizations.sms_quota             IS 'Monthly message quota (inbound + outbound)';
COMMENT ON COLUMN organizations.monthly_message_count IS 'Current month total message count (reset on billing cycle)';
COMMENT ON COLUMN organizations.monthly_mms_count     IS 'Current month MMS count (hard cap 50)';
COMMENT ON COLUMN organizations.sms_overage_enabled   IS 'If false, hard block at quota. If true, allow overage at $0.03/msg.';

-- Atomic usage increment function (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_sms_usage(p_org_id UUID, p_is_mms BOOLEAN DEFAULT FALSE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organizations
  SET
    monthly_message_count = monthly_message_count + 1,
    monthly_mms_count     = CASE WHEN p_is_mms THEN monthly_mms_count + 1 ELSE monthly_mms_count END
  WHERE id = p_org_id;
END;
$$;
