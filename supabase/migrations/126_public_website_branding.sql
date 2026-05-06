-- Public dealer website branding (logo + optional contact email shown on public site).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS website_logo_url text,
  ADD COLUMN IF NOT EXISTS website_contact_email text;

COMMENT ON COLUMN public.organizations.website_logo_url IS 'HTTPS URL to dealership logo for public inventory site (optional).';
COMMENT ON COLUMN public.organizations.website_contact_email IS 'Optional public contact email shown on dealer website footer/hero.';
