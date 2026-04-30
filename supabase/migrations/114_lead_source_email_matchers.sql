ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS lead_source_email_matchers JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.org_settings.lead_source_email_matchers
  IS 'Org-scoped inbound lead sender rules. Array of {type, value} objects used across Gmail and IMAP lead intake.';
