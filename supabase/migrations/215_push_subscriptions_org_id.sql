-- Migration 108: Add org_id to push_subscriptions for tenant-scoped push notifications.
-- Without this column, sendLeadNotification broadcasts to ALL dealers — a cross-org privacy bug.
-- After this migration, send.ts filters by org_id and subscribe/route.ts writes org_id on insert.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Back-fill org_id from profiles for existing rows (best-effort; rows without a matching profile stay NULL).
UPDATE push_subscriptions ps
SET    org_id = p.org_id
FROM   profiles p
WHERE  ps.user_id = p.id
  AND  ps.org_id IS NULL;

-- Index for fast org-scoped lookups on send.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_org_id ON push_subscriptions (org_id);
