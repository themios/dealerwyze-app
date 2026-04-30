-- Migration 111: Durable Stripe webhook event deduplication.
-- Replaces the in-process Map (not safe across Vercel instances) with a DB record.
-- Each event ID is inserted before processing; a unique constraint rejects duplicates.
-- Rows older than 7 days are pruned by the data-retention cron.

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id    TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient pruning of old rows
CREATE INDEX IF NOT EXISTS processed_stripe_events_processed_at_idx
  ON processed_stripe_events (processed_at);
