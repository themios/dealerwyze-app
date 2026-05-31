-- Voice webhook idempotency hardening.
-- 1. Add processing claim columns on voice_calls so only one worker can process a call.
-- 2. Add a partial unique index on activities(external_id, type) for provider retry dedup.

ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_voice_calls_processing_claim
  ON voice_calls(call_sid, processing_started_at, processed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_external_id_type_unique
  ON activities(external_id, type)
  WHERE external_id IS NOT NULL;

COMMENT ON INDEX idx_activities_external_id_type_unique IS
'Prevents duplicate provider-driven activities from webhook retries (voice call_sid, SMS message_sid, etc.).';
