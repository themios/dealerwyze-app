-- Lead assignment mode + round-robin index on org_settings
-- Mode: 'owner' (default), 'round_robin', 'manual'
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS lead_assignment_mode TEXT NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS lead_assignment_rep_index INTEGER NOT NULL DEFAULT 0;

-- assigned_to on customers already exists (TEXT column pointing to profile id)
-- No changes needed to customers table.
