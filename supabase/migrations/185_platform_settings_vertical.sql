-- Migration 185: Add vertical scoping to platform_settings
-- Allows each vertical (DealerWyze, RealtyWyze) to have its own
-- platform name, support email, and other identity settings.

-- Add vertical column; existing row is the dealer vertical
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'dealer';

-- Tag the existing row as dealer
UPDATE platform_settings SET vertical = 'dealer' WHERE vertical = '' OR vertical IS NULL;

-- Seed RealtyWyze settings row
INSERT INTO platform_settings (
  vertical,
  platform_name,
  support_email,
  support_phone,
  default_trial_days,
  default_timezone
)
SELECT
  'real_estate',
  'RealtyWyze',
  'support@realtywyze.us',
  NULL,
  30,
  'America/Los_Angeles'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE vertical = 'real_estate'
);

-- Enforce one row per vertical
ALTER TABLE platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_vertical_unique;
ALTER TABLE platform_settings
  ADD CONSTRAINT platform_settings_vertical_unique UNIQUE (vertical);
