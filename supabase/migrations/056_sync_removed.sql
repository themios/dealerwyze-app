-- Migration 056: Add sync_removed_at column to vehicles
-- Vehicles not found during a sync are now marked sync_removed instead of deleted.
-- Dealers review them in Inventory and mark as sold or restore to available.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS sync_removed_at timestamptz;

-- Index for fast lookup of pending-review vehicles per org
CREATE INDEX IF NOT EXISTS vehicles_sync_removed_idx
  ON public.vehicles (user_id, status)
  WHERE status = 'sync_removed';
