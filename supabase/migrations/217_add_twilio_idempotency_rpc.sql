-- Atomic Twilio inbound idempotency claim.
-- Prevents race conditions by making "check + insert" one atomic statement.
CREATE OR REPLACE FUNCTION claim_twilio_message_sid(
  p_message_sid TEXT,
  p_org_id UUID
)
RETURNS TABLE(is_duplicate BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  WITH claim AS (
    INSERT INTO processed_twilio_messages (message_sid, org_id)
    VALUES (p_message_sid, p_org_id)
    ON CONFLICT (message_sid) DO NOTHING
    RETURNING 1
  )
  SELECT NOT EXISTS (SELECT 1 FROM claim) AS is_duplicate;
END;
$$ LANGUAGE plpgsql;
