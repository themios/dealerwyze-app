-- Helper for Vercel db-backup cron: returns all public base tables.
-- SECURITY DEFINER so it can read information_schema regardless of caller role.
CREATE OR REPLACE FUNCTION get_backup_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.table_name::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
$$;
