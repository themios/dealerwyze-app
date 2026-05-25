-- Migration 187: Add vertical scoping to platform_feature_flags
-- Each vertical can have its own feature flag configuration.
-- Existing flags are dealer-specific (BHPH, public_website, want_list, etc.).

ALTER TABLE platform_feature_flags
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'dealer';

-- Tag all existing flags as dealer
UPDATE platform_feature_flags SET vertical = 'dealer' WHERE vertical = '' OR vertical IS NULL;

-- Index for fast vertical-filtered queries
CREATE INDEX IF NOT EXISTS platform_feature_flags_vertical_idx
  ON platform_feature_flags (vertical);

-- Seed RealtyWyze feature flags (subset relevant to RE vertical)
INSERT INTO platform_feature_flags (flag_key, display_name, description, enabled_globally, enabled_for_plans, kill_switch, vertical)
VALUES
  ('content_pipeline', 'Content Pipeline',    'AI social content drafts',         true,  ARRAY['trial','starter','growth','pro'], false, 'real_estate'),
  ('sequences',        'Follow-up Sequences', 'Automated outreach sequences',      true,  ARRAY['starter','growth','pro'],          false, 'real_estate'),
  ('ai_voice',         'AI Voice Leads',      'Retell AI call answering',          true,  ARRAY['growth','pro'],                   false, 'real_estate'),
  ('video_rendering',  'Video Rendering',     'Remotion Lambda video gen',         true,  ARRAY['growth','pro'],                   false, 'real_estate')
ON CONFLICT DO NOTHING;
