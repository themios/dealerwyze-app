-- Migration 188: Change platform_feature_flags unique constraint from (flag_key) to (flag_key, vertical)
-- Migration 187 seeded RE flags with ON CONFLICT DO NOTHING, but the unique constraint
-- was on flag_key alone — so all 4 RE flag inserts silently failed because the same
-- flag_keys already existed as dealer rows. This migration fixes the constraint
-- and inserts the missing RE rows.

-- Drop the existing single-column unique constraint (may already be gone)
ALTER TABLE platform_feature_flags
  DROP CONSTRAINT IF EXISTS platform_feature_flags_flag_key_key;

-- Add composite unique constraint (idempotent — skips if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_feature_flags_flag_key_vertical_key'
  ) THEN
    ALTER TABLE platform_feature_flags
      ADD CONSTRAINT platform_feature_flags_flag_key_vertical_key UNIQUE (flag_key, vertical);
  END IF;
END $$;

-- Insert the 4 RE-specific flags that failed in migration 187
INSERT INTO platform_feature_flags (flag_key, display_name, description, enabled_globally, enabled_for_plans, kill_switch, vertical)
VALUES
  ('content_pipeline', 'Content Pipeline',    'AI social content drafts',         true,  ARRAY['trial','starter','growth','pro'], false, 'real_estate'),
  ('sequences',        'Follow-up Sequences', 'Automated outreach sequences',      true,  ARRAY['starter','growth','pro'],          false, 'real_estate'),
  ('ai_voice',         'AI Voice Leads',      'Retell AI call answering',          true,  ARRAY['growth','pro'],                   false, 'real_estate'),
  ('video_rendering',  'Video Rendering',     'Remotion Lambda video gen',         true,  ARRAY['growth','pro'],                   false, 'real_estate')
ON CONFLICT (flag_key, vertical) DO NOTHING;
