-- 140: Harden push_subscriptions tenant isolation (NOT NULL org_id).
-- 108 added nullable org_id + index; this migration backfills, drops orphans, enforces NOT NULL.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.push_subscriptions ps
SET    org_id = p.org_id
FROM   public.profiles p
WHERE  ps.user_id = p.id
  AND  ps.org_id IS NULL;

-- Rows with no matching profile cannot be attributed to an org; drop them rather than leaking NULL org_id.
DELETE FROM public.push_subscriptions
WHERE org_id IS NULL;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_org_id ON public.push_subscriptions (org_id);
