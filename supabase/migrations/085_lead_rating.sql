-- Migration 085: Lead rating for hot/warm/cold signals
-- Stores source-declared hot leads (CarGurus Hot Lead, AutoTrader Shopper Reminder)
-- and re-inquiry signals (returning customer from same source)

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS lead_rating VARCHAR(10)
    CHECK (lead_rating IN ('hot', 'warm', 'cold'));

COMMENT ON COLUMN customers.lead_rating IS
  'hot = source flagged as hot or re-inquiry from existing customer; warm = engaged; cold = stale. Null = no rating set.';
