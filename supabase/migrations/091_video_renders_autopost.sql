-- Add auto-post preferences to video_renders so the webhook knows what to post
ALTER TABLE video_renders
  ADD COLUMN IF NOT EXISTS auto_post          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_post_platforms text[]  NOT NULL DEFAULT '{}';
