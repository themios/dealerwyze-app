-- Dealer Meta (Facebook Page + Instagram Business) credentials and publish audit log.
-- Access tokens MUST only be read/written via server routes using the Supabase service role.

CREATE TABLE IF NOT EXISTS public.org_social_posting (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  meta_page_id TEXT,
  meta_page_access_token TEXT,
  instagram_business_account_id TEXT,
  facebook_feed BOOLEAN NOT NULL DEFAULT TRUE,
  instagram_feed BOOLEAN NOT NULL DEFAULT TRUE,
  facebook_story BOOLEAN NOT NULL DEFAULT FALSE,
  instagram_story BOOLEAN NOT NULL DEFAULT FALSE,
  daily_ai_post_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_ai_timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  last_daily_post_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_social_posting_daily
  ON public.org_social_posting (daily_ai_post_enabled)
  WHERE daily_ai_post_enabled = TRUE;

COMMENT ON TABLE public.org_social_posting IS 'Facebook Page token + IG user id per org — service-role API only; feed posting supported, stories flagged for future.';

CREATE TABLE IF NOT EXISTS public.social_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  video_render_id UUID,
  platform TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'feed',
  status TEXT NOT NULL DEFAULT 'pending',
  platform_post_url TEXT,
  graph_object_id TEXT,
  posted_at TIMESTAMPTZ,
  error_message TEXT,
  caption TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_publish_log_vehicle_created
  ON public.social_publish_log (vehicle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_publish_log_org_created
  ON public.social_publish_log (org_id, created_at DESC);

COMMENT ON COLUMN public.social_publish_log.video_render_id IS 'FK to video_renders optional — table may live outside migrations; UUID kept for linkage.';
