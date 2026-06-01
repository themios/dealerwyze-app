-- Migration 057: Storage Pack add-on
-- Adds per-org dynamic storage quota and storage pack tracking to org_settings

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS storage_quota_bytes   bigint      NOT NULL DEFAULT 524288000, -- 500 MB default
  ADD COLUMN IF NOT EXISTS storage_pack          text        NOT NULL DEFAULT 'none',    -- 'none' | '10gb' | '25gb'
  ADD COLUMN IF NOT EXISTS storage_pack_stripe_sub_id text,                              -- Stripe subscription ID that includes the pack
  ADD COLUMN IF NOT EXISTS storage_pack_expires_at    timestamptz;                       -- Grace period end (set on cancellation/non-payment)

COMMENT ON COLUMN public.org_settings.storage_quota_bytes    IS 'Current effective storage quota in bytes. Updated by Stripe webhook on pack purchase/cancellation.';
COMMENT ON COLUMN public.org_settings.storage_pack           IS 'Active storage pack: none | 10gb | 25gb';
COMMENT ON COLUMN public.org_settings.storage_pack_expires_at IS 'Set when pack is cancelled/payment fails. Files above base quota are deleted after this date (90-day grace).';
