-- 066_vehicle_market_intelligence.sql
-- Smart Pricing Intelligence: market data + NHTSA reliability + AI description
-- Run after: 065_inventory_inquiries.sql

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS market_data_json   JSONB,
  ADD COLUMN IF NOT EXISTS market_checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_description     TEXT,
  ADD COLUMN IF NOT EXISTS nhtsa_recall_count INTEGER,
  ADD COLUMN IF NOT EXISTS reliability_tier   TEXT; -- 'low' | 'moderate' | 'high'

-- Index: allows cron or admin jobs to find stale market checks (>24h old)
CREATE INDEX IF NOT EXISTS idx_vehicles_market_checked
  ON public.vehicles (market_checked_at)
  WHERE market_checked_at IS NOT NULL;

COMMENT ON COLUMN public.vehicles.market_data_json IS
  'Cached market intelligence: {fastSalePrice, fairMarketPrice, maxReturnPrice, confidence, nComps, medianMiles, avgDom, sources, perplexityInsights, checkedAt}';
COMMENT ON COLUMN public.vehicles.ai_description IS
  'AI-generated vehicle listing description for VDP / social / CarGurus. Regenerate on demand.';
COMMENT ON COLUMN public.vehicles.nhtsa_recall_count IS
  'Active recall count from NHTSA API at last market check.';
COMMENT ON COLUMN public.vehicles.reliability_tier IS
  'Derived from recall count + Perplexity reliability score: low | moderate | high risk.';
