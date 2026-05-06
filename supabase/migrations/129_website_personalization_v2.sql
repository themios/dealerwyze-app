-- Extended dealer public website fields (SEO, hero, CTA, tracking, OG/favicon).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS website_established_year int,
  ADD COLUMN IF NOT EXISTS website_specialty_tags text[],
  ADD COLUMN IF NOT EXISTS website_service_area text,
  ADD COLUMN IF NOT EXISTS website_awards text,
  ADD COLUMN IF NOT EXISTS website_cta_label text,
  ADD COLUMN IF NOT EXISTS website_cta_url text,
  ADD COLUMN IF NOT EXISTS website_hero_headline text,
  ADD COLUMN IF NOT EXISTS website_hero_subline text,
  ADD COLUMN IF NOT EXISTS website_favicon_url text,
  ADD COLUMN IF NOT EXISTS website_og_image_url text,
  ADD COLUMN IF NOT EXISTS website_robots_noindex boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_google_site_verification text,
  ADD COLUMN IF NOT EXISTS website_gtm_id text;

COMMENT ON COLUMN public.organizations.website_established_year IS 'Year founded — JSON-LD foundingDate.';
COMMENT ON COLUMN public.organizations.website_specialty_tags IS 'Up to 8 short tags; visible chips + knowsAbout.';
COMMENT ON COLUMN public.organizations.website_service_area IS 'Local service copy for body + areaServed.';
COMMENT ON COLUMN public.organizations.website_cta_label IS 'Header primary button label override.';
COMMENT ON COLUMN public.organizations.website_cta_url IS 'Optional https: or site-relative CTA URL.';
COMMENT ON COLUMN public.organizations.website_hero_headline IS 'Inventory page H1 override.';
COMMENT ON COLUMN public.organizations.website_hero_subline IS 'Inventory hero script line override.';
COMMENT ON COLUMN public.organizations.website_robots_noindex IS 'When true, public dealer pages emit noindex.';

-- Larger uploads for OG images (logos stay 2 MB in API).
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'dealer-branding';
