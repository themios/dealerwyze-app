-- 189_listing_import_tracking.sql
-- Phase 7: Additive import tracking and performance metric columns on vehicles
-- Dealer smoke-test gate: verify dealer /vehicles/new + VIN decode still works after applying
-- All columns nullable — no NOT NULL — so existing dealer rows are unaffected.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS import_source      TEXT,
  ADD COLUMN IF NOT EXISTS import_url         TEXT,
  ADD COLUMN IF NOT EXISTS import_raw_json    JSONB,
  ADD COLUMN IF NOT EXISTS showing_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_change_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_change_log   JSONB;

CREATE INDEX IF NOT EXISTS idx_vehicles_import_source
  ON vehicles(import_source) WHERE import_source IS NOT NULL;
