-- Add vehicle_state column to audit_log for auction sync state tracking (Phase 06).

ALTER TABLE public.audit_log
ADD COLUMN vehicle_state TEXT
  CHECK (vehicle_state IS NULL OR vehicle_state IN ('new_import', 'price_updated', 'status_updated', 'no_change'));

CREATE INDEX IF NOT EXISTS idx_audit_log_vehicle_state
  ON public.audit_log (vehicle_state, created_at DESC)
  WHERE vehicle_state IS NOT NULL;

COMMENT ON COLUMN public.audit_log.vehicle_state IS 'Vehicle state in auction sync: new_import (first seen), price_updated (bid changed), status_updated (condition/inventory changed), no_change (unchanged)';
