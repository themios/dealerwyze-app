-- Add purchased render credits column to org_video_settings
ALTER TABLE org_video_settings
  ADD COLUMN IF NOT EXISTS render_credits_purchased integer NOT NULL DEFAULT 0;

-- Comment for clarity
COMMENT ON COLUMN org_video_settings.render_credits_purchased IS
  'Additional render credits purchased via video packs. Added on top of plan quota. Resets monthly with quota.';
