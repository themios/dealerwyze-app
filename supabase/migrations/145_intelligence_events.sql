-- Migration 145: DMAIC Learning Engine — intelligence_events table (Phase 1 Event Foundation)
-- Captures every meaningful interaction and outcome for per-dealer and cross-tenant analysis.
-- Non-blocking: app code emits fire-and-forget; this table is append-only.

CREATE TABLE IF NOT EXISTS public.intelligence_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  event_type   TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  actor_id     UUID,
  channel      TEXT,
  direction    TEXT CHECK (direction IN ('inbound', 'outbound', NULL)),
  outcome      TEXT,
  metadata     JSONB,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query pattern: all events for an org, filtered by type and time window
CREATE INDEX IF NOT EXISTS intelligence_events_org_type_time
  ON public.intelligence_events (org_id, event_type, occurred_at DESC);

-- Secondary: look up all events for a specific entity (lead, vehicle, staff)
CREATE INDEX IF NOT EXISTS intelligence_events_org_entity
  ON public.intelligence_events (org_id, entity_type, entity_id);

-- RLS: each org sees only its own events
ALTER TABLE public.intelligence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can read their intelligence events" ON public.intelligence_events;
CREATE POLICY "org members can read their intelligence events" ON public.intelligence_events
  FOR SELECT
  USING (org_id = (SELECT auth.uid()));

-- No INSERT/UPDATE/DELETE policy for authenticated users — all writes go through
-- emitEvent() which uses the service role (same pattern as audit_log).

COMMENT ON TABLE public.intelligence_events IS
  'DMAIC Learning Engine event stream. Append-only. All writes via service role (emitEvent helper).';
