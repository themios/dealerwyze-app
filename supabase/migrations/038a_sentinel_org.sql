-- ============================================================
-- 038a_sentinel_org.sql
-- Two things:
-- 1. Drop the FK that tied organizations.id to auth.users.id.
--    In the original single-tenant design "org id = owner user id"
--    was enforced by this FK. For true SaaS, organizations are
--    independent entities — no auth user needs to exist for an org.
-- 2. Insert a sentinel org row used by platform staff profiles.
--    Platform staff have no real dealership; their profiles.org_id
--    must satisfy the NOT NULL constraint, so we use a reserved UUID.
-- ============================================================

-- Step 1: remove the FK so organizations.id is a free UUID
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_id_fkey;

-- Step 2: insert sentinel org (idempotent)
INSERT INTO organizations (id, name, plan, subscription_status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Platform Staff Sentinel', 'platform', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO org_settings (org_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (org_id) DO NOTHING;
