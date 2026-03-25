-- Expand task_type CHECK to include types added by cron jobs and new features
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_task_type_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_task_type_check CHECK (task_type IN (
    'lead_response', 'lead_followup', 'appointment_confirm',
    'inventory_review', 'receipt_review', 'manual',
    'callback', 'card_batch_print', 'deal_checklist'
  ));

-- Expand priority CHECK to include 'high', 'normal', 'low' used by cron + new tasks
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_priority_check CHECK (priority IN (
    'must', 'should', 'high', 'normal', 'low'
  ));

-- Index for deal checklist lookups by customer
CREATE INDEX IF NOT EXISTS idx_tasks_deal_checklist
  ON tasks (linked_customer_id, task_type, status)
  WHERE task_type = 'deal_checklist';
