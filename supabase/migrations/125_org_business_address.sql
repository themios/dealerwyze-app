-- Add business_address to organizations if it doesn't exist.
-- Was defined in 009_saas but may not have been applied to all environments.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_address text;
