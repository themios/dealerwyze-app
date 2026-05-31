-- RealtyWyze Showing Scheduler: Core tables for showing requests and feedback
-- Track showing requests from buyers on public listing pages
-- Allow agents to confirm/decline/propose times
-- Capture post-showing feedback and buyer interest

-- showing_requests: buyer inquiries for property showings
CREATE TABLE IF NOT EXISTS showing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  requested_time_1 TIMESTAMPTZ,
  requested_time_2 TIMESTAMPTZ,
  requested_time_3 TIMESTAMPTZ,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'no_show', 'closed')),
  confirmed_at TIMESTAMPTZ,
  confirmed_time TIMESTAMPTZ,
  google_calendar_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- showing_feedback: agent's assessment after showing
CREATE TABLE IF NOT EXISTS showing_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  showing_request_id UUID NOT NULL REFERENCES showing_requests(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  showed BOOLEAN NOT NULL,
  buyer_interest TEXT CHECK (buyer_interest IS NULL OR buyer_interest IN ('high', 'medium', 'low')),
  feedback TEXT,
  follow_up_action TEXT CHECK (follow_up_action IS NULL OR follow_up_action IN ('schedule_follow_up', 'send_details', 'wait_for_buyer', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(showing_request_id)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_showing_requests_org ON showing_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_showing_requests_agent ON showing_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_showing_requests_listing ON showing_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_showing_requests_status ON showing_requests(status);
CREATE INDEX IF NOT EXISTS idx_showing_requests_created ON showing_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_showing_feedback_org ON showing_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_showing_feedback_agent ON showing_feedback(agent_id);
CREATE INDEX IF NOT EXISTS idx_showing_feedback_showing_request ON showing_feedback(showing_request_id);

-- RLS Policies

-- Enable RLS
ALTER TABLE showing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE showing_feedback ENABLE ROW LEVEL SECURITY;

-- Agent can view showing requests for their own listings
CREATE POLICY "Agent can view own showing requests"
  ON showing_requests FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND agent_id = (SELECT id FROM profiles WHERE org_id = showing_requests.org_id AND id = auth.uid() LIMIT 1)
  );

-- Agent can create showing requests (as agent, owner links to their listings)
CREATE POLICY "Agent can create own showing requests"
  ON showing_requests FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND agent_id = (SELECT id FROM profiles WHERE org_id = showing_requests.org_id AND id = auth.uid() LIMIT 1)
  );

-- Agent can update showing requests (status, confirmed_time, calendar event)
CREATE POLICY "Agent can update own showing requests"
  ON showing_requests FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND agent_id = (SELECT id FROM profiles WHERE org_id = showing_requests.org_id AND id = auth.uid() LIMIT 1)
  );

-- Agent can delete showing requests (soft delete via status, but allow hard delete if needed)
CREATE POLICY "Agent can delete own showing requests"
  ON showing_requests FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND agent_id = (SELECT id FROM profiles WHERE org_id = showing_requests.org_id AND id = auth.uid() LIMIT 1)
  );

-- Agent can view feedback for their own showings
CREATE POLICY "Agent can view own feedback"
  ON showing_feedback FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND agent_id = (SELECT id FROM profiles WHERE org_id = showing_feedback.org_id AND id = auth.uid() LIMIT 1)
  );

-- Agent can create feedback for their own showings
CREATE POLICY "Agent can create own feedback"
  ON showing_feedback FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND agent_id = (SELECT id FROM profiles WHERE org_id = showing_feedback.org_id AND id = auth.uid() LIMIT 1)
  );

-- Agent can update their feedback
CREATE POLICY "Agent can update own feedback"
  ON showing_feedback FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND agent_id = (SELECT id FROM profiles WHERE org_id = showing_feedback.org_id AND id = auth.uid() LIMIT 1)
  );

-- Comments
COMMENT ON TABLE showing_requests IS
'Buyer requests to view a real estate listing. Agents confirm/decline/propose times. Org-scoped and agent-owned.';

COMMENT ON TABLE showing_feedback IS
'Post-showing assessment from agent: attended? buyer interest level? follow-up needed? Org-scoped and agent-owned.';

COMMENT ON COLUMN showing_requests.status IS
'pending: awaiting agent response | confirmed: agent selected a time | declined: agent unavailable | no_show: agent marked as no-show | closed: feedback submitted and followup complete';

COMMENT ON COLUMN showing_feedback.showed IS
'true if showing occurred, false if agent marks as no-show';

COMMENT ON COLUMN showing_feedback.follow_up_action IS
'What the agent wants to do next: schedule a follow-up meeting, send listing details, wait for buyer to contact, or none';
