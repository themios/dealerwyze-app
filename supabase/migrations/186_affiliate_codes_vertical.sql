-- Migration 186: Add vertical scoping to affiliate_codes
-- Each affiliate code belongs to one product vertical.
-- Existing codes default to 'dealer' (all existing codes are DealerWyze).

ALTER TABLE affiliate_codes
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'dealer';

-- Tag all existing codes as dealer
UPDATE affiliate_codes SET vertical = 'dealer' WHERE vertical = '' OR vertical IS NULL;

-- Index for fast vertical-filtered list queries
CREATE INDEX IF NOT EXISTS affiliate_codes_vertical_idx ON affiliate_codes (vertical);
