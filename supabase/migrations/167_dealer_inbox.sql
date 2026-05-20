-- 167_dealer_inbox.sql
-- Dealer Success Inbox: platform-to-dealer two-way communication system.
-- Separate from customer CRM. Dealers are tenants/accounts, not leads.

-- Threads: one per conversation context per org
CREATE TABLE dealer_threads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject     TEXT        NOT NULL,
  thread_type TEXT        NOT NULL DEFAULT 'success',
  -- thread_type values: success | support | billing | sales
  status      TEXT        NOT NULL DEFAULT 'open',
  -- status values: open | resolved | archived
  assigned_to UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealer_threads_org    ON dealer_threads (org_id, updated_at DESC);
CREATE INDEX idx_dealer_threads_status ON dealer_threads (status, updated_at DESC);
CREATE INDEX idx_dealer_threads_owner  ON dealer_threads (assigned_to, updated_at DESC);

-- Messages: inbound and outbound messages within a thread
CREATE TABLE dealer_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID        NOT NULL REFERENCES dealer_threads(id) ON DELETE CASCADE,
  org_id      UUID        NOT NULL,
  sender_type TEXT        NOT NULL,
  -- sender_type values: platform | dealer | system
  sender_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  -- null for system-generated messages
  channel     TEXT        NOT NULL DEFAULT 'email',
  -- channel values: email | in_app | note | call_log | sms
  subject     TEXT,
  body        TEXT        NOT NULL,
  resend_id   TEXT,
  -- Resend message ID for email tracking / reply threading
  read_at     TIMESTAMPTZ,
  -- null = unread by the other party
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealer_messages_thread ON dealer_messages (thread_id, sent_at ASC);
CREATE INDEX idx_dealer_messages_org    ON dealer_messages (org_id, sent_at DESC);

-- Tasks: follow-up reminders tied to a dealer or thread
CREATE TABLE dealer_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id   UUID        REFERENCES dealer_threads(id) ON DELETE SET NULL,
  assigned_to UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  notes       TEXT,
  due_at      TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dealer_tasks_org    ON dealer_tasks (org_id, due_at ASC);
CREATE INDEX idx_dealer_tasks_owner  ON dealer_tasks (assigned_to, due_at ASC);
CREATE INDEX idx_dealer_tasks_thread ON dealer_tasks (thread_id);

-- RLS: dealers can read their own threads and messages; platform staff use service role
ALTER TABLE dealer_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_tasks    ENABLE ROW LEVEL SECURITY;

-- Dealers read their own threads
CREATE POLICY dealer_threads_dealer_read ON dealer_threads
  FOR SELECT USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Dealers read their own messages
CREATE POLICY dealer_messages_dealer_read ON dealer_messages
  FOR SELECT USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Dealers can insert messages (replies) on their own threads, channel = in_app only
CREATE POLICY dealer_messages_dealer_insert ON dealer_messages
  FOR INSERT WITH CHECK (
    org_id      = (SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND sender_type = 'dealer'
    AND channel IN ('email', 'in_app')
  );

-- Dealers read their own tasks
CREATE POLICY dealer_tasks_dealer_read ON dealer_tasks
  FOR SELECT USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Update thread updated_at on new message
CREATE OR REPLACE FUNCTION update_dealer_thread_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE dealer_threads SET updated_at = NOW() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dealer_message_update_thread
  AFTER INSERT ON dealer_messages
  FOR EACH ROW EXECUTE FUNCTION update_dealer_thread_ts();
