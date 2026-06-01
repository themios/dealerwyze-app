-- Migration 146: DMAIC Learning Engine — recommendations table (Phase 3)
-- Pre-generated per-dealer recommendations. Expire automatically. Feedback tracked via acted_on_at / dismissed_at.
-- All INSERTs via service role (nightly cron). Dealers can SELECT and UPDATE status fields only.

CREATE TABLE IF NOT EXISTS public.recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('lead', 'inventory', 'acquisition', 'operational', 'timing')),
  priority        TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  evidence        JSONB,
  entity_type     TEXT CHECK (entity_type IN ('lead', 'vehicle', 'staff', 'org')),
  entity_id       UUID,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  dismissed_at    TIMESTAMPTZ,
  acted_on_at     TIMESTAMPTZ,
  outcome         JSONB
);

-- Primary read pattern: active recommendations for an org, newest first
CREATE INDEX IF NOT EXISTS recommendations_org_active
  ON public.recommendations (org_id, generated_at DESC)
  WHERE dismissed_at IS NULL;

-- Entity lookup: find recommendation for a specific vehicle or lead
CREATE INDEX IF NOT EXISTS recommendations_org_entity
  ON public.recommendations (org_id, entity_type, entity_id)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

-- Dealers read their own org's recommendations only
DROP POLICY IF EXISTS "org members read recommendations" ON public.recommendations;
CREATE POLICY "org members read recommendations" ON public.recommendations FOR SELECT
  USING (org_id = (SELECT auth.uid()));

-- Dealers can dismiss and mark acted-on (status fields only — no INSERT)
DROP POLICY IF EXISTS "org members update recommendation status" ON public.recommendations;
CREATE POLICY "org members update recommendation status" ON public.recommendations FOR UPDATE
  USING (org_id = (SELECT auth.uid()))
  WITH CHECK (org_id = (SELECT auth.uid()));

COMMENT ON TABLE public.recommendations IS
  'DMAIC Phase 3: Pre-generated per-dealer recommendations. Nightly cron inserts via service role. Expired rows are soft-dead.';
