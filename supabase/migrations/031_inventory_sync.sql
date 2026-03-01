-- 031_inventory_sync.sql
-- Track inventory feed sync status per channel in org_settings

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS feed_cg_last_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feed_cg_last_count       INTEGER,
  ADD COLUMN IF NOT EXISTS feed_cg_last_error       TEXT,
  ADD COLUMN IF NOT EXISTS feed_fb_last_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feed_fb_last_count       INTEGER,
  ADD COLUMN IF NOT EXISTS feed_fb_last_error       TEXT;
