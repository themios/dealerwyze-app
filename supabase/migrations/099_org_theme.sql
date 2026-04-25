-- Migration 099: Per-org theme customization
-- Adds theme columns to org_settings for dealer appearance personalization

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS theme_preset       TEXT DEFAULT 'dealerwyze',
  ADD COLUMN IF NOT EXISTS theme_primary      TEXT,
  ADD COLUMN IF NOT EXISTS theme_accent       TEXT,
  ADD COLUMN IF NOT EXISTS theme_font_style   TEXT DEFAULT 'modern';

COMMENT ON COLUMN org_settings.theme_preset     IS 'Named preset key, or "custom" when dealer has set manual colors';
COMMENT ON COLUMN org_settings.theme_primary    IS 'Custom primary color hex (used when theme_preset = custom)';
COMMENT ON COLUMN org_settings.theme_accent     IS 'Custom accent color hex (used when theme_preset = custom)';
COMMENT ON COLUMN org_settings.theme_font_style IS 'Font style preference: modern | classic | bold';
