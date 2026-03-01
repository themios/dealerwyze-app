-- General-purpose tasks table (operational: manual, inventory_review, receipt_review)
-- Lead/communication tasks are still handled by the activities table

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'manual' CHECK (task_type IN (
    'lead_response', 'lead_followup', 'appointment_confirm',
    'inventory_review', 'receipt_review', 'manual'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  priority TEXT NOT NULL DEFAULT 'should' CHECK (priority IN ('must', 'should')),
  due_at TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ,
  linked_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  linked_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  linked_receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
  source_event TEXT,
  auto_generated BOOLEAN DEFAULT false,
  last_action TEXT CHECK (last_action IN ('call', 'text', 'email', 'none')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_tasks" ON tasks;
CREATE POLICY "users_own_tasks" ON tasks
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS tasks_user_status_due ON tasks(user_id, status, due_at);
CREATE INDEX IF NOT EXISTS tasks_user_open ON tasks(user_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS tasks_linked_receipt ON tasks(linked_receipt_id) WHERE linked_receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_linked_vehicle ON tasks(linked_vehicle_id) WHERE linked_vehicle_id IS NOT NULL;
