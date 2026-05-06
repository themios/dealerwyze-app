-- Enterprise: block direct anon/authenticated access to credential + publish-log tables.
-- All reads/writes go through Next.js routes with the Supabase service role key.

ALTER TABLE public.org_social_posting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_publish_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.org_social_posting FROM anon;
REVOKE ALL ON TABLE public.org_social_posting FROM authenticated;
REVOKE ALL ON TABLE public.social_publish_log FROM anon;
REVOKE ALL ON TABLE public.social_publish_log FROM authenticated;

COMMENT ON TABLE public.org_social_posting IS E'RLS + REVOKE: service_role API only. Prefer Vault/encryption-at-rest roadmap for tokens; never expose SELECT to JWT roles.';

ALTER TABLE public.social_publish_log DROP CONSTRAINT IF EXISTS social_publish_log_platform_check;
ALTER TABLE public.social_publish_log ADD CONSTRAINT social_publish_log_platform_check
  CHECK (platform IN ('facebook', 'instagram'));

ALTER TABLE public.social_publish_log DROP CONSTRAINT IF EXISTS social_publish_log_placement_check;
ALTER TABLE public.social_publish_log ADD CONSTRAINT social_publish_log_placement_check
  CHECK (placement IN ('feed', 'story'));

ALTER TABLE public.social_publish_log DROP CONSTRAINT IF EXISTS social_publish_log_status_check;
ALTER TABLE public.social_publish_log ADD CONSTRAINT social_publish_log_status_check
  CHECK (status IN ('pending', 'posting', 'posted', 'failed', 'skipped'));
