-- Migration 060: Staff-to-dealership assignments
-- Allows platform superadmin to assign a support staff member to each org.
-- Staff member is responsible for onboarding, tickets, and retention for assigned orgs.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_assigned_staff
  ON public.organizations(assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

COMMENT ON COLUMN public.organizations.assigned_staff_id IS
  'Platform staff member responsible for this org (onboarding, support, retention). Set by superadmin.';
