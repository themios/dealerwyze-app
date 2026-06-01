-- Migration 184: Add realtywyze@gmail.com as platform superadmin (Test Account - Historical)
-- This grants admin panel access for the RealtyWyze vertical.
-- NOTE: realtywyze@gmail.com is a test/seed account used during development.
-- Production admins should use company domain emails. This migration is historical
-- and kept for audit trail. Do not depend on this account for production admin access.
-- platform_superusers is keyed on auth.users.id (UUID).

INSERT INTO platform_superusers (user_id)
SELECT au.id
FROM auth.users au
WHERE au.email = 'realtywyze@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM platform_superusers ps WHERE ps.user_id = au.id
  );
