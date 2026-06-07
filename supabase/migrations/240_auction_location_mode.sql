-- Migration: Add auction_location_mode to org_settings for per-org location assignment strategy
-- Phase 07: Allows dealers to configure whether auction imports auto-assign to primary location
-- or require manual location selection per vehicle.

ALTER TABLE public.org_settings
ADD COLUMN IF NOT EXISTS auction_location_mode TEXT
  DEFAULT 'default'
  CHECK (auction_location_mode IN ('default', 'manual'));

CREATE INDEX IF NOT EXISTS idx_org_settings_auction_location_mode
  ON public.org_settings (org_id)
  WHERE auction_location_mode IS NOT NULL;

COMMENT ON COLUMN public.org_settings.auction_location_mode IS
  'Auction import location strategy: default (auto-assign to primary location) | manual (user selects per vehicle). Defaults to "default" for backward compatibility.';
