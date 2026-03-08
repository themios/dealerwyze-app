-- ============================================================
-- 055_channel_rep.sql
-- Salesperson (channel rep) portal:
--   • Adds 'channel_rep' to platform_role CHECK
--   • Adds affiliate_code FK on profiles to link rep ↔ code
-- ============================================================

-- Expand CHECK to include channel_rep
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_platform_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_platform_role_check
  CHECK (platform_role IN ('platform_staff', 'channel_rep'));

-- Link a profile directly to their affiliate code
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS affiliate_code text
  REFERENCES public.affiliate_codes(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_affiliate_code
  ON public.profiles(affiliate_code);

-- Channel rep can archive dealers from their own view (soft-hide, never deletes)
CREATE TABLE IF NOT EXISTS public.rep_archived_orgs (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, org_id)
);

-- Service role only — reps can only archive via /api/sales/* routes
ALTER TABLE public.rep_archived_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_rep_archived_orgs" ON public.rep_archived_orgs
  FOR ALL USING (false);
