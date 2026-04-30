-- Migration 106: Add storage_used_bytes to org_settings for free-tier enforcement
-- Applied manually by Tim in Supabase SQL editor

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0;

-- Index for efficient lookup by org
CREATE INDEX IF NOT EXISTS idx_org_settings_storage ON org_settings (org_id, storage_used_bytes);
