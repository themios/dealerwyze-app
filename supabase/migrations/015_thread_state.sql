-- 015_thread_state.sql
-- Communication Thread State Machine: per-customer state tracking

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS thread_state      TEXT        NOT NULL DEFAULT 'new_lead',
  ADD COLUMN IF NOT EXISTS last_outbound_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_inbound_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_type  TEXT,
  ADD COLUMN IF NOT EXISTS engagement_score  INTEGER     NOT NULL DEFAULT 0;

-- Valid states: new_lead | contacted | engaged | appointment_set | appointment_confirmed | showed | sold | lost | dormant
COMMENT ON COLUMN customers.thread_state       IS 'Communication thread state machine state';
COMMENT ON COLUMN customers.engagement_score   IS 'Count of inbound messages received (proxy for engagement depth)';
COMMENT ON COLUMN customers.next_action_due_at IS 'When the next action is due (drives Today screen ordering)';
COMMENT ON COLUMN customers.next_action_type   IS 'follow_up | confirm_appointment | reengage';

CREATE INDEX IF NOT EXISTS idx_customers_thread_state     ON customers(thread_state);
CREATE INDEX IF NOT EXISTS idx_customers_next_action_due  ON customers(next_action_due_at) WHERE next_action_due_at IS NOT NULL;

-- Atomic engagement score increment function
CREATE OR REPLACE FUNCTION increment_engagement_score(p_customer_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE customers SET engagement_score = engagement_score + 1 WHERE id = p_customer_id;
END;
$$;
