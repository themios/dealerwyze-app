-- 029_response_tracking.sql
-- Track first outbound response time per lead

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS first_response_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;

-- Partial index: only un-responded leads for fast cron alert scans
CREATE INDEX IF NOT EXISTS idx_customers_response
  ON customers(user_id, created_at, lead_source)
  WHERE first_response_at IS NULL;

-- Backfill: derive from earliest outbound activity for existing customers
UPDATE customers c
SET
  first_response_at     = a.min_sent,
  response_time_seconds = GREATEST(0, EXTRACT(EPOCH FROM (a.min_sent - c.created_at))::INTEGER)
FROM (
  SELECT customer_id, MIN(created_at) AS min_sent
  FROM activities
  WHERE direction = 'outbound'
    AND type IN ('sms', 'call', 'email')
  GROUP BY customer_id
) a
WHERE c.id = a.customer_id
  AND c.first_response_at IS NULL;
