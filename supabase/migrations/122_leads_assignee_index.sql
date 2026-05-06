-- Speed up admin "filter by rep" queries on the customers table.
-- customers has no org_id; tenant scoping is on user_id.
CREATE INDEX IF NOT EXISTS idx_customers_user_id_assigned_to
  ON public.customers (user_id, assigned_to);
