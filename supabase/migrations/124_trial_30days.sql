-- Extend default trial from 14 to 30 days for all new organizations.
-- Existing orgs are unaffected (DEFAULT only applies at INSERT time).
ALTER TABLE organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '30 days');
