-- Migration 161: Tighten dealer_locations write policies to admin roles only.
--
-- The original policies in 157 checked org_id membership for all operations,
-- but did not restrict writes by role. Any org member (sales rep, agent) could
-- mutate location records. This migration replaces the write policies so that
-- INSERT/UPDATE/DELETE require dealer_admin or admin role.
--
-- SELECT remains open to all org members (unchanged behavior).
-- Service-role clients (routes, crons, webhooks) bypass RLS and are unaffected.

-- Helper: returns the authenticated user's role (stable, security-definer so it
-- reads profiles without requiring a second RLS-visible path).
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Replace write policies with role-restricted versions.
DROP POLICY IF EXISTS "dealer_locations_insert" ON dealer_locations;
DROP POLICY IF EXISTS "dealer_locations_update" ON dealer_locations;
DROP POLICY IF EXISTS "dealer_locations_delete" ON dealer_locations;

DROP POLICY IF EXISTS "dealer_locations_insert" ON dealer_locations;
CREATE POLICY "dealer_locations_insert" ON dealer_locations
  FOR INSERT
  WITH CHECK (
    org_id = get_org_id()
    AND get_my_role() IN ('dealer_admin', 'admin')
  );

DROP POLICY IF EXISTS "dealer_locations_update" ON dealer_locations;
CREATE POLICY "dealer_locations_update" ON dealer_locations
  FOR UPDATE
  USING (
    org_id = get_org_id()
    AND get_my_role() IN ('dealer_admin', 'admin')
  )
  WITH CHECK (
    org_id = get_org_id()
    AND get_my_role() IN ('dealer_admin', 'admin')
  );

DROP POLICY IF EXISTS "dealer_locations_delete" ON dealer_locations;
CREATE POLICY "dealer_locations_delete" ON dealer_locations
  FOR DELETE
  USING (
    org_id = get_org_id()
    AND get_my_role() IN ('dealer_admin', 'admin')
  );
