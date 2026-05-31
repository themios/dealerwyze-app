-- Twilio SMS webhook idempotency hardening.
-- Add a table to track processed Twilio MessageSids, preventing duplicate processing
-- when Twilio retries the webhook due to transient failures.
--
-- Pattern: Before processing any Twilio SMS webhook, check if MessageSid is in this table.
-- If present, return 200 OK without reprocessing (idempotent).
-- If absent, process and insert MessageSid after success.
--
-- Mirrors the pattern used in processed_stripe_events for Stripe webhook dedup.

CREATE TABLE IF NOT EXISTS processed_twilio_messages (
  message_sid TEXT PRIMARY KEY NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT message_sid_not_empty CHECK (char_length(message_sid) > 0)
);

CREATE INDEX IF NOT EXISTS idx_processed_twilio_org
  ON processed_twilio_messages(org_id);

COMMENT ON TABLE processed_twilio_messages IS
'Durable dedup log for Twilio inbound SMS webhooks. Prevents duplicate lead/activity creation when Twilio retries after transient failures.';

COMMENT ON COLUMN processed_twilio_messages.message_sid IS
'Twilio MessageSid (unique per message, globally).';

COMMENT ON COLUMN processed_twilio_messages.org_id IS
'Organization that owns the phone number. Included for audit trail and cleanup on org deletion.';
