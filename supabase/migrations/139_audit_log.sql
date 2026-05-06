-- Append-only audit trail for high-risk actions (Phase 5 v1.1).
-- Writes use service role only; authenticated users may SELECT their org's rows.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organizations (id) ON DELETE SET NULL,
  actor_id    UUID,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('staff', 'user')),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_log IS 'Security audit log — append-only; INSERT via service role; no UPDATE/DELETE.';

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
  ON public.audit_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_action
  ON public.audit_log (org_id, action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Dealers see only rows for their org (rows with NULL org_id are ops-only / service role).
CREATE POLICY audit_log_select_own_org
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (org_id IS NOT NULL AND org_id = public.get_org_id());

-- Intentionally no INSERT/UPDATE/DELETE policies for authenticated — service role bypasses RLS.
