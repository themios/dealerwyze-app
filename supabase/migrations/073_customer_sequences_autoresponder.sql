-- 073_customer_sequences_autoresponder.sql
-- Adds per-channel autoresponder metadata to customer_sequences.
-- Enables: channel-aware status (email vs SMS separate), scheduled start,
-- stop reason tracking, and duplicate-enrollment prevention per channel.

-- ── 1. New columns ────────────────────────────────────────────────────────────
ALTER TABLE customer_sequences
  ADD COLUMN IF NOT EXISTS channel        text,
  ADD COLUMN IF NOT EXISTS start_at       timestamptz,
  ADD COLUMN IF NOT EXISTS stop_reason    text,
  ADD COLUMN IF NOT EXISTS stopped_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_step_sent_at timestamptz;

-- ── 2. Check constraints ──────────────────────────────────────────────────────
ALTER TABLE customer_sequences
  DROP CONSTRAINT IF EXISTS customer_sequences_channel_check,
  DROP CONSTRAINT IF EXISTS customer_sequences_stop_reason_check;

ALTER TABLE customer_sequences
  ADD CONSTRAINT customer_sequences_channel_check
    CHECK (channel IS NULL OR channel IN ('email', 'sms')),
  ADD CONSTRAINT customer_sequences_stop_reason_check
    CHECK (stop_reason IS NULL OR stop_reason IN ('replied', 'unsubscribed', 'manual', 'completed'));

-- ── 3. Backfill channel from linked sequence ──────────────────────────────────
UPDATE customer_sequences cs
SET    channel = s.channel
FROM   sequences s
WHERE  cs.sequence_id = s.id
  AND  cs.channel IS NULL;

-- ── 4. Partial unique index: one active/paused enrollment per customer/channel ─
-- Drop existing dupes first (keep the newest by enrolled_at per customer+channel)
DELETE FROM customer_sequences
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY customer_id, channel
             ORDER BY enrolled_at DESC
           ) AS rn
    FROM customer_sequences
    WHERE status IN ('active', 'paused')
      AND channel IS NOT NULL
  ) ranked
  WHERE rn > 1
);

DROP INDEX IF EXISTS customer_sequences_active_per_channel;
CREATE UNIQUE INDEX customer_sequences_active_per_channel
  ON customer_sequences (customer_id, channel)
  WHERE status IN ('active', 'paused') AND channel IS NOT NULL;

-- ── 5. Index for efficient per-customer channel-status lookups ────────────────
DROP INDEX IF EXISTS idx_customer_sequences_customer_channel;
CREATE INDEX idx_customer_sequences_customer_channel
  ON customer_sequences (org_id, customer_id, channel, status);
