-- Migration 220: Pilot feedback captured by platform admins during RealtyWyze pilot

CREATE TABLE IF NOT EXISTS pilot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  agent_email TEXT,
  recorded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_date DATE,
  overall_rating INT CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)),
  booking_flow_rating INT CHECK (booking_flow_rating IS NULL OR (booking_flow_rating >= 1 AND booking_flow_rating <= 5)),
  email_delivery_ok BOOLEAN,
  blockers TEXT,
  feature_requests TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_feedback_org_id ON pilot_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_pilot_feedback_created_at ON pilot_feedback(created_at DESC);

ALTER TABLE pilot_feedback ENABLE ROW LEVEL SECURITY;

-- No direct client access; API uses service role
CREATE POLICY pilot_feedback_deny_all ON pilot_feedback FOR ALL USING (false);
