-- Migration 008: Auto-set user_id on insert for all org-scoped tables
-- This lets client-side code insert rows without knowing the org_id;
-- the trigger resolves it from the current user's profile.

CREATE OR REPLACE FUNCTION public.auto_set_org_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := (SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;

-- Customers
DROP TRIGGER IF EXISTS trg_customers_user_id ON customers;
CREATE TRIGGER trg_customers_user_id
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_user_id();

-- Vehicles
DROP TRIGGER IF EXISTS trg_vehicles_user_id ON vehicles;
CREATE TRIGGER trg_vehicles_user_id
  BEFORE INSERT ON vehicles
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_user_id();

-- Activities
DROP TRIGGER IF EXISTS trg_activities_user_id ON activities;
CREATE TRIGGER trg_activities_user_id
  BEFORE INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_user_id();

-- Templates
DROP TRIGGER IF EXISTS trg_templates_user_id ON templates;
CREATE TRIGGER trg_templates_user_id
  BEFORE INSERT ON templates
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_user_id();
