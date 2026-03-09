-- Migration 058: Add is_favorite to templates
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

-- Index for fast favorite lookups per org
CREATE INDEX IF NOT EXISTS idx_templates_user_favorite
  ON public.templates(user_id, is_favorite)
  WHERE is_favorite = true;
