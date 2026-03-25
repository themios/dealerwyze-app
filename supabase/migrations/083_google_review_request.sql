-- Migration 083: Google review request settings + review_request task type

-- Add review request settings to org_settings
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS google_review_url          TEXT,
  ADD COLUMN IF NOT EXISTS review_request_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_request_delay_days  INTEGER NOT NULL DEFAULT 0
    CHECK (review_request_delay_days >= 0 AND review_request_delay_days <= 365);

-- Expand task_type CHECK to include review_request
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_task_type_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_task_type_check CHECK (task_type IN (
    'lead_response', 'lead_followup', 'appointment_confirm', 'inventory_review',
    'receipt_review', 'manual', 'callback', 'card_batch_print', 'deal_checklist',
    'review_request'
  ));

-- Index for cron job lookup
CREATE INDEX IF NOT EXISTS idx_tasks_review_request_due
  ON tasks (due_at, status)
  WHERE task_type = 'review_request' AND status = 'open';
