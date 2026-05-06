-- Track when AI description was last generated for a vehicle.
-- Used to enforce reanalysis cooldown and show staleness badge when docs added after.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS ai_last_analyzed_at TIMESTAMPTZ;
