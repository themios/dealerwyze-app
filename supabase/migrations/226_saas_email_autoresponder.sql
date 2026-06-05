-- Per-org and per-agent SaaS email nurture sequences (slug saas_email_nurture)

ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.sequences.slug IS 'Stable id e.g. saas_email_nurture for platform default campaigns';
COMMENT ON COLUMN public.sequences.owner_user_id IS 'When set, this sequence is the agent personal copy; null = org-wide default';

CREATE UNIQUE INDEX IF NOT EXISTS sequences_org_slug_org_default
  ON public.sequences (org_id, slug)
  WHERE slug IS NOT NULL AND owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sequences_org_slug_agent
  ON public.sequences (org_id, slug, owner_user_id)
  WHERE slug IS NOT NULL AND owner_user_id IS NOT NULL;
