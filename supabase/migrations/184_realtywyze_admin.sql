-- Migration 184: Add realtywyze@gmail.com as platform superadmin
-- This grants admin panel access for the RealtyWyze vertical.
-- platform_superusers is keyed on auth.users.id (UUID).

INSERT INTO platform_superusers (user_id)
SELECT au.id
FROM auth.users au
WHERE au.email = 'realtywyze@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM platform_superusers ps WHERE ps.user_id = au.id
  );
