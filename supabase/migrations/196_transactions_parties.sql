-- Migration 196: Add missing parties JSONB column to transactions
-- Additive only — no existing data affected.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS parties JSONB;
