-- Dealer public website personalization (story, overrides, theme, fonts, SEO helpers).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS website_about text,
  ADD COLUMN IF NOT EXISTS website_hours text,
  ADD COLUMN IF NOT EXISTS website_contact_phone text,
  ADD COLUMN IF NOT EXISTS website_contact_address text,
  ADD COLUMN IF NOT EXISTS website_social jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS website_theme jsonb,
  ADD COLUMN IF NOT EXISTS website_font_preset text NOT NULL DEFAULT 'apollo',
  ADD COLUMN IF NOT EXISTS website_seo_description text,
  ADD COLUMN IF NOT EXISTS website_seo_keywords text;

COMMENT ON COLUMN public.organizations.website_about IS 'Public “About us” / story (plain text, shown on inventory page; feeds JSON-LD description).';
COMMENT ON COLUMN public.organizations.website_hours IS 'Optional business hours line(s) for public footer.';
COMMENT ON COLUMN public.organizations.website_contact_phone IS 'Optional public-site phone override (else org_settings.business_phone).';
COMMENT ON COLUMN public.organizations.website_contact_address IS 'Optional public-site address override (else org_settings.business_address).';
COMMENT ON COLUMN public.organizations.website_social IS 'Optional social profile URLs: { facebook, instagram, youtube, tiktok, x }.';
COMMENT ON COLUMN public.organizations.website_theme IS 'Optional hex palette { navy, navyDeep, navyLight, gold, goldLight, cream, warmWhite, ink }.';
COMMENT ON COLUMN public.organizations.website_font_preset IS 'Typography preset: apollo | heritage | metro | showroom | minimal.';
COMMENT ON COLUMN public.organizations.website_seo_description IS 'Optional meta description override (max ~320 chars; else tagline + about snippet).';
COMMENT ON COLUMN public.organizations.website_seo_keywords IS 'Optional comma-separated focus keywords for meta keywords (supplemental SEO / AI context).';
