-- Per-location round-robin cursor for multi-location orgs (Phase 4)
ALTER TABLE dealer_locations
  ADD COLUMN IF NOT EXISTS round_robin_index INT NOT NULL DEFAULT 0;
