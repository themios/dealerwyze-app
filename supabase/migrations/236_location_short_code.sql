-- Add short_code field to dealer_locations for custom location display names
ALTER TABLE dealer_locations
ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dealer_locations_short_code ON dealer_locations(org_id, short_code);
