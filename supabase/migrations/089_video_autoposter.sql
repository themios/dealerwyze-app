-- Migration 089: Video Auto-Poster
-- Creates tables for video rendering, social accounts, and social posting.
-- Applied manually in Supabase SQL editor.

-- video_templates (platform-owned, all authenticated dealers can read)
CREATE TABLE IF NOT EXISTS video_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  composition_id   text NOT NULL,
  thumbnail_url    text NOT NULL DEFAULT '',
  aspect_ratio     text NOT NULL DEFAULT '16:9' CHECK (aspect_ratio IN ('16:9', '9:16')),
  duration_seconds integer NOT NULL DEFAULT 40,
  best_for         text[] NOT NULL DEFAULT '{}',
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE video_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_video_templates" ON video_templates
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

-- org_video_settings (one row per org, created on first use)
CREATE TABLE IF NOT EXISTS org_video_settings (
  org_id                  uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  favorite_template_ids   uuid[] NOT NULL DEFAULT '{}',
  default_voice           text NOT NULL DEFAULT 'en-US-Neural2-D',
  auto_post_on_listing    boolean NOT NULL DEFAULT false,
  auto_post_platforms     text[] NOT NULL DEFAULT '{}',
  caption_template        text,
  include_price           boolean NOT NULL DEFAULT true,
  include_phone           boolean NOT NULL DEFAULT true,
  watermark_enabled       boolean NOT NULL DEFAULT true,
  render_quota_used       integer NOT NULL DEFAULT 0,
  render_quota_reset_at   timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE org_video_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_video_settings_scope" ON org_video_settings
  FOR ALL USING (org_id = public.get_org_id());

-- video_renders (one per render attempt per vehicle)
CREATE TABLE IF NOT EXISTS video_renders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id          uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  template_id         uuid NOT NULL REFERENCES video_templates(id),
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'rendering', 'complete', 'failed')),
  aspect_ratio        text NOT NULL DEFAULT '16:9',
  output_url          text,
  narration_url       text,
  lambda_render_id    text,
  triggered_by        text NOT NULL DEFAULT 'manual'
                      CHECK (triggered_by IN ('auto', 'manual')),
  triggered_by_user   uuid REFERENCES profiles(id),
  error_message       text,
  props_snapshot      jsonb,
  selected_photo_urls text[],
  voice_name          text,
  file_size_bytes     bigint,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
ALTER TABLE video_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_video_renders_scope" ON video_renders
  FOR ALL USING (org_id = public.get_org_id());

-- social_accounts (per-org connected social platforms)
CREATE TABLE IF NOT EXISTS social_accounts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform                    text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  account_label               text NOT NULL DEFAULT '',
  platform_account_id         text NOT NULL,
  access_token                text NOT NULL,
  refresh_token               text,
  token_expires_at            timestamptz,
  scopes                      text[] NOT NULL DEFAULT '{}',
  page_id                     text,
  instagram_business_account_id text,
  is_active                   boolean NOT NULL DEFAULT true,
  connected_at                timestamptz NOT NULL DEFAULT now(),
  disconnected_at             timestamptz,
  UNIQUE (org_id, platform, platform_account_id)
);
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_social_accounts_scope" ON social_accounts
  FOR ALL USING (org_id = public.get_org_id());

-- social_posts (each post attempt per render per platform)
CREATE TABLE IF NOT EXISTS social_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  render_id           uuid NOT NULL REFERENCES video_renders(id) ON DELETE CASCADE,
  vehicle_id          uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  social_account_id   uuid NOT NULL REFERENCES social_accounts(id),
  platform            text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  caption             text NOT NULL DEFAULT '',
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'posting', 'posted', 'failed', 'skipped')),
  platform_post_id    text,
  platform_post_url   text,
  error_message       text,
  attempt_count       integer NOT NULL DEFAULT 0,
  posted_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_social_posts_scope" ON social_posts
  FOR ALL USING (org_id = public.get_org_id());

-- Seed default templates
INSERT INTO video_templates (name, description, composition_id, aspect_ratio, duration_seconds, best_for, sort_order)
VALUES
  (
    'Modern Dark',
    'Bold dark theme with animated price reveal - great for premium vehicles',
    'VehicleModernDark',
    '16:9',
    40,
    ARRAY['facebook', 'youtube'],
    1
  ),
  (
    'Reels Portrait',
    'Vertical 9:16 format optimized for Instagram Reels and TikTok',
    'VehicleReelsPortrait',
    '9:16',
    30,
    ARRAY['instagram', 'tiktok'],
    2
  ),
  (
    'Photo Slideshow',
    'Clean photo-forward slideshow with Ken Burns effect',
    'VehiclePhotoSlideshow',
    '16:9',
    35,
    ARRAY['facebook', 'youtube'],
    3
  )
ON CONFLICT DO NOTHING;
