-- Support ticket system
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'   CHECK (status   IN ('open','in_progress','resolved','closed')),
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT,          -- denormalised display name snapshot
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_org      ON support_tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_msgs      ON support_ticket_messages(ticket_id);

ALTER TABLE support_tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages  ENABLE ROW LEVEL SECURITY;

-- Dealers see only their org's tickets
DROP POLICY IF EXISTS "tickets_org" ON support_tickets;
CREATE POLICY "tickets_org" ON support_tickets FOR ALL USING (
  org_id IN (SELECT p.org_id FROM profiles p WHERE p.id = auth.uid())
);

-- Dealers see only non-internal messages on their org's tickets
DROP POLICY IF EXISTS "ticket_msgs_org" ON support_ticket_messages;
CREATE POLICY "ticket_msgs_org" ON support_ticket_messages FOR ALL USING (
  is_internal = false
  AND ticket_id IN (
    SELECT t.id FROM support_tickets t
    JOIN profiles p ON p.org_id = t.org_id
    WHERE p.id = auth.uid()
  )
);
