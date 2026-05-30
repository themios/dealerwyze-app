-- Migration 197: Add agent_notes HTML column to vehicles
-- Stores import-extracted listing description formatted as HTML.
-- Additive only — no existing data affected.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS agent_notes TEXT;
