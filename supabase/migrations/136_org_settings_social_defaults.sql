-- Migration 136: Social post defaults per org
-- Adds three text columns to org_settings so dealers can define a default
-- hashtag block, tagline, and footer that are appended to every manual
-- social post caption (Facebook posts, Instagram carousels, etc.).

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS social_hashtags TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_tagline  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_footer   TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.org_settings.social_hashtags IS 'Default hashtag block appended to every social post caption (e.g. "#usedcars #dealerwyze")';
COMMENT ON COLUMN public.org_settings.social_tagline  IS 'Short dealer tagline shown after the vehicle line (e.g. "Serving Ventura & LA County")';
COMMENT ON COLUMN public.org_settings.social_footer   IS 'Footer text appended after hashtags (e.g. "📍 123 Main St · Mon-Sat 9-6")';
