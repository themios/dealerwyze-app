-- Migration 061: Platform roles and permissions
-- Adds granular area permissions for platform_admin role.
-- New platform_role values: platform_admin, platform_staff_manager, platform_sales_manager
-- (platform_staff already exists)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS platform_permissions text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.platform_permissions IS
  'For platform_admin role: permitted area slugs. Values: dealers,retention,sales,analytics,staff,tickets,alerts,audit,affiliates,commissions,billing';
