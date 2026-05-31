-- Add composite index for voice phone lookup optimization
-- Speeds up customer matching by (user_id, primary_phone, secondary_phone)
-- Used in lib/voice/ingest.ts to efficiently find customers by phone number

CREATE INDEX IF NOT EXISTS idx_customers_phone_lookup
ON customers (user_id, primary_phone, secondary_phone)
WHERE merged_at IS NULL;

-- Allow Postgres planner to use the index for inbound call matching
-- The index covers the three most important columns in voice webhook ingest
ANALYZE customers;
